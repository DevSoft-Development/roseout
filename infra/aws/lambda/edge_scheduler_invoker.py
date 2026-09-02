import json
import os
from datetime import datetime, timezone
from urllib.parse import urlsplit

import boto3
from botocore.config import Config

# Nested RequestResponse invocations must not use botocore's default ~60s
# read timeout/retry behavior. A retry can start the same background job again
# while the first Lambda is still running. Keep one attempt and leave enough
# headroom inside the scheduler invoker's 125-second Lambda timeout.
lambda_client = boto3.client(
    "lambda",
    config=Config(
        connect_timeout=5,
        read_timeout=115,
        retries={"total_max_attempts": 1, "mode": "standard"},
    ),
)
cloudwatch = boto3.client("cloudwatch")
sqs = boto3.client("sqs")

edge_function = os.environ["EDGE_RUNTIME_FUNCTION_NAME"]
background_function = edge_function.replace("-edge-runtime", "-background-runtime")
environment = edge_function.removeprefix("toh-").removesuffix("-edge-runtime")
app_env_secret_name = f"/theouthaven/{environment}/platform-dr/app-env"
app_env_secret_region = os.environ.get("BACKGROUND_APP_ENV_SECRET_REGION", "us-west-2")
domain_queue_name = f"toh-{environment}-domain-lifecycle"
dr_namespace = "TheOutHaven/DR"
expected_ready_tables = 462
_cron_secret = None


def numeric(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def metric(name, value, dimensions=None, unit="Count"):
    item = {
        "MetricName": name,
        "Value": numeric(value),
        "Unit": unit,
    }
    if dimensions:
        item["Dimensions"] = dimensions
    return item


def emit_dr_metrics(operation, parsed_body, success):
    if not operation:
        return
    dimensions = [{"Name": "Operation", "Value": operation}]
    data = [
        metric("ReconcileHeartbeat", 1, dimensions),
        metric("ReconcileSuccess", 1 if success else 0, dimensions),
    ]

    if success and isinstance(parsed_body, dict):
        guard = parsed_body.get("guard") or {}
        data.extend(
            [
                metric("StandbyHealthy", 1),
                metric("SourceCronJobs", guard.get("sourceCronJobs", 0)),
                metric("SourceActiveSlots", guard.get("sourceActiveSlots", 0)),
                metric("WalLagBytes", guard.get("sourceSlotLagBytes", 0), unit="Bytes"),
                metric("TargetActiveCronJobs", guard.get("targetActiveCronJobs", 0)),
                metric(
                    "ReadyTableGap",
                    max(0, expected_ready_tables - numeric(guard.get("targetReadyTables", 0))),
                ),
                metric("ConnectedWorkers", guard.get("targetConnectedWorkers", 0)),
            ]
        )
        if operation == "auth":
            data.append(metric("AuthParity", 1 if parsed_body.get("parity") is True else 0))
        if operation == "storage":
            data.extend(
                [
                    metric("StorageCopyOrReplace", parsed_body.get("copyOrReplace", 0)),
                    metric("StorageDeferredCopies", parsed_body.get("deferredCopies", 0)),
                    metric("StorageTargetOnly", parsed_body.get("targetOnly", 0)),
                    metric("StoragePendingDeletes", parsed_body.get("pendingDeletes", 0)),
                ]
            )
    else:
        data.append(metric("StandbyHealthy", 0))
        if operation == "auth":
            data.append(metric("AuthParity", 0))

    try:
        cloudwatch.put_metric_data(Namespace=dr_namespace, MetricData=data)
    except Exception as exc:
        print(f"Failed to publish DR CloudWatch metrics: {type(exc).__name__}")


def get_cron_secret():
    global _cron_secret
    if _cron_secret:
        return _cron_secret
    client = boto3.client("secretsmanager", region_name=app_env_secret_region)
    response = client.get_secret_value(SecretId=app_env_secret_name)
    parsed = json.loads(response.get("SecretString") or "{}")
    secret = str(parsed.get("CRON_SECRET") or "").strip()
    if not secret:
        raise RuntimeError("Background app environment is missing CRON_SECRET")
    _cron_secret = secret
    return secret


def parse_lambda_response(payload):
    decoded = json.loads(payload or "{}")
    status = int(decoded.get("statusCode") or 200)
    raw_body = decoded.get("body")
    parsed_body = raw_body
    if isinstance(raw_body, str):
        try:
            parsed_body = json.loads(raw_body)
        except Exception:
            parsed_body = raw_body[:2000]
    return status, parsed_body


def invoke_function(function_name, event):
    response = lambda_client.invoke(
        FunctionName=function_name,
        InvocationType="RequestResponse",
        Payload=json.dumps(event).encode("utf-8"),
    )
    payload = response["Payload"].read().decode("utf-8")
    if response.get("FunctionError"):
        raise RuntimeError(f"Lambda error from {function_name}: {payload[:2000]}")
    return parse_lambda_response(payload)


def build_http_event(method, path, query, body, headers, request_id):
    now = datetime.now(timezone.utc)
    event = {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "rawQueryString": query,
        "headers": headers,
        "requestContext": {
            "accountId": "scheduler",
            "apiId": "scheduler",
            "domainName": "internal",
            "domainPrefix": "internal",
            "http": {
                "method": method,
                "path": path,
                "protocol": "HTTP/1.1",
                "sourceIp": "127.0.0.1",
                "userAgent": "theouthaven-eventbridge",
            },
            "requestId": request_id,
            "routeKey": f"{method} {path}",
            "stage": "$default",
            "time": now.strftime("%d/%b/%Y:%H:%M:%S +0000"),
            "timeEpoch": int(now.timestamp() * 1000),
        },
        "isBase64Encoded": False,
    }
    if body is not None and method not in {"GET", "HEAD"}:
        event["body"] = json.dumps(body, separators=(",", ":"))
    return event


def invoke_edge(function_name, body, context):
    body = dict(body)
    if body.pop("_inject_scheduled_at", False):
        body["scheduled_at"] = datetime.now(timezone.utc).isoformat()

    dr_operation = str(body.get("operation") or "status") if function_name == "dr-standby-reconciler" else ""
    path = f"/functions/v1/{function_name}"
    http_event = build_http_event(
        "POST",
        path,
        "",
        body,
        {
            "content-type": "application/json",
            "x-toh-aws-internal": "eventbridge",
        },
        context.aws_request_id,
    )
    status, parsed_body = invoke_function(edge_function, http_event)
    success = status < 400 and not (
        isinstance(parsed_body, dict) and parsed_body.get("success") is False
    )
    emit_dr_metrics(dr_operation, parsed_body, success)
    if status >= 400:
        raise RuntimeError(f"{function_name} returned HTTP {status}: {str(parsed_body)[:2000]}")
    if isinstance(parsed_body, dict) and parsed_body.get("success") is False:
        raise RuntimeError(f"{function_name} returned success=false: {str(parsed_body)[:2000]}")
    return {
        "ok": True,
        "runtime": "edge",
        "function": function_name,
        "status": status,
        "response": parsed_body,
    }


def invoke_node(target, body, context):
    parsed = urlsplit(target)
    path = parsed.path or "/"
    method = "POST" if body else "GET"
    secret = get_cron_secret()
    http_event = build_http_event(
        method,
        path,
        parsed.query,
        body if body else None,
        {
            "content-type": "application/json",
            "authorization": f"Bearer {secret}",
            "x-cron-secret": secret,
            "x-toh-aws-internal": "eventbridge",
        },
        context.aws_request_id,
    )
    status, parsed_body = invoke_function(background_function, http_event)
    if status >= 400:
        raise RuntimeError(f"{target} returned HTTP {status}: {str(parsed_body)[:2000]}")
    if isinstance(parsed_body, dict) and parsed_body.get("success") is False:
        raise RuntimeError(f"{target} returned success=false: {str(parsed_body)[:2000]}")
    return {
        "ok": True,
        "runtime": "node",
        "target": target,
        "status": status,
        "response": parsed_body,
    }


def enqueue_domain_lifecycle(body):
    payload = dict(body)
    payload.setdefault("version", 1)
    payload.setdefault("jobType", "domain.lifecycle.tick")
    payload.setdefault("source", "eventbridge-scheduler")
    queue_url = sqs.get_queue_url(QueueName=domain_queue_name)["QueueUrl"]
    response = sqs.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(payload, separators=(",", ":")),
    )
    return {
        "ok": True,
        "runtime": "sqs",
        "queue": "domain-lifecycle",
        "messageId": response.get("MessageId"),
    }


def handler(event, context):
    function_name = str(event.get("function") or "").strip()
    if not function_name:
        raise ValueError("Missing scheduled function name")

    body = event.get("body") or {}
    if not isinstance(body, dict):
        raise ValueError("Scheduled body must be an object")

    if function_name.startswith("node:"):
        target = function_name.removeprefix("node:").strip()
        if not target.startswith("/"):
            raise ValueError("Node schedule target must be an internal absolute path")
        return invoke_node(target, body, context)

    if function_name == "sqs:domain-lifecycle":
        return enqueue_domain_lifecycle(body)

    if function_name.startswith("sqs:"):
        raise ValueError(f"Unsupported scheduled queue target: {function_name}")

    return invoke_edge(function_name, body, context)
