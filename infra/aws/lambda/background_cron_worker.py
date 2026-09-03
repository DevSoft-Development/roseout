import json
import os
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit

import boto3
from botocore.config import Config

BACKGROUND_FUNCTION_NAME = os.environ["BACKGROUND_FUNCTION_NAME"]
EDGE_RUNTIME_FUNCTION_NAME = os.environ["EDGE_RUNTIME_FUNCTION_NAME"]
BACKGROUND_CRON_QUEUE_URL = os.environ["BACKGROUND_CRON_QUEUE_URL"]
APP_ENV_SECRET_NAME = os.environ["APP_ENV_SECRET_NAME"]
APP_ENV_SECRET_REGION = os.environ.get("APP_ENV_SECRET_REGION", "us-west-2")
MAX_CHAIN_DEPTH = int(os.environ.get("MAX_CHAIN_DEPTH", "64"))
MAX_CHAIN_AGE_SECONDS = int(os.environ.get("MAX_CHAIN_AGE_SECONDS", "3600"))

lambda_client = boto3.client(
    "lambda",
    config=Config(
        connect_timeout=5,
        read_timeout=305,
        retries={"total_max_attempts": 1, "mode": "standard"},
    ),
)
sqs_client = boto3.client("sqs")
secrets_client = boto3.client("secretsmanager", region_name=APP_ENV_SECRET_REGION)
_cron_secret = None
_worker_secret = None

EDGE_ALLOWED_TARGETS = {
    "edge:claim-qr-repair-worker",
    "edge:unified-location-gap-repair",
    "edge:worker-dispatcher",
    "edge:aws-db-maintenance",
    "edge:admin-marketing-report-scheduler",
}

EVENT_DRIVEN_TARGETS = {
    "/api/cron/managed?job=location-search-profile-worker",
    "/api/cron/managed?job=catalog-enrichment-runner",
    "/api/cron/managed?job=location-description-backfill",
    "/api/cron/managed?job=search-ml-learning-maintenance",
    *EDGE_ALLOWED_TARGETS,
}


def _app_env():
    response = secrets_client.get_secret_value(SecretId=APP_ENV_SECRET_NAME)
    return json.loads(response.get("SecretString") or "{}")


def _cron_secret_value():
    global _cron_secret
    if _cron_secret:
        return _cron_secret
    parsed = _app_env()
    secret = str(parsed.get("CRON_SECRET") or "").strip()
    if not secret:
        raise RuntimeError("background_app_environment_missing_cron_secret")
    _cron_secret = secret
    return secret


def _worker_secret_value():
    global _worker_secret
    if _worker_secret:
        return _worker_secret
    parsed = _app_env()
    secret = str(parsed.get("WORKER_INTERNAL_SECRET") or "").strip()
    if not secret:
        raise RuntimeError("background_app_environment_missing_worker_internal_secret")
    _worker_secret = secret
    return secret


def _base_http_event(method, path, query, body, headers, request_id):
    now = datetime.now(timezone.utc)
    event = {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "rawQueryString": query,
        "headers": headers,
        "requestContext": {
            "accountId": "background-cron-worker",
            "apiId": "background-cron-worker",
            "domainName": "internal",
            "domainPrefix": "internal",
            "http": {
                "method": method,
                "path": path,
                "protocol": "HTTP/1.1",
                "sourceIp": "127.0.0.1",
                "userAgent": "theouthaven-background-cron-worker",
            },
            "requestId": request_id,
            "routeKey": f"{method} {path}",
            "stage": "$default",
            "time": now.strftime("%d/%b/%Y:%H:%M:%S +0000"),
            "timeEpoch": int(now.timestamp() * 1000),
        },
        "isBase64Encoded": False,
    }
    if body:
        event["body"] = json.dumps(body, separators=(",", ":"))
    return event


def _build_http_event(target, body, request_id):
    parsed = urlsplit(target)
    path = parsed.path or "/"
    if not path.startswith("/api/cron/"):
        raise ValueError("background_cron_target_not_allowed")
    if not isinstance(body, dict):
        raise ValueError("background_cron_body_must_be_object")

    method = "POST" if body else "GET"
    secret = _cron_secret_value()
    return _base_http_event(
        method,
        path,
        parsed.query,
        body,
        {
            "content-type": "application/json",
            "authorization": f"Bearer {secret}",
            "x-cron-secret": secret,
            "x-toh-aws-internal": "background-cron-worker",
        },
        request_id,
    )


def _build_edge_http_event(target, body, request_id):
    if target not in EDGE_ALLOWED_TARGETS:
        raise ValueError("background_edge_target_not_allowed")
    if not isinstance(body, dict):
        raise ValueError("background_cron_body_must_be_object")
    function_name = target.removeprefix("edge:")
    path = f"/functions/v1/{function_name}"
    return _base_http_event(
        "POST",
        path,
        "",
        body,
        {
            "content-type": "application/json",
            "x-worker-secret": _worker_secret_value(),
            "x-toh-aws-internal": "background-cron-worker",
        },
        request_id,
    )


def _parse_response(payload):
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


def _numeric(value):
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _should_continue(target, parsed_body):
    if target not in EVENT_DRIVEN_TARGETS or not isinstance(parsed_body, dict):
        return False

    if target.endswith("job=location-search-profile-worker"):
        return _numeric(parsed_body.get("processed")) > 0

    if target.endswith("job=catalog-enrichment-runner"):
        remaining = _numeric(parsed_body.get("remaining"))
        progressed = _numeric(parsed_body.get("processed")) + _numeric(parsed_body.get("retried"))
        return remaining > 0 and progressed > 0

    if target.endswith("job=location-description-backfill"):
        batch = parsed_body.get("batch") or {}
        return isinstance(batch, dict) and _numeric(batch.get("selected")) > 0

    if target.endswith("job=search-ml-learning-maintenance"):
        steps = parsed_body.get("steps") or {}
        tags = steps.get("tags") if isinstance(steps, dict) else {}
        value = tags.get("value") if isinstance(tags, dict) else {}
        if not isinstance(value, dict):
            return False
        remaining = _numeric(value.get("remainingEstimate"))
        progressed = _numeric(value.get("updated")) + _numeric(value.get("failed"))
        return remaining > 0 and progressed > 0

    if target == "edge:claim-qr-repair-worker":
        return _numeric(parsed_body.get("claimed")) > 0 and parsed_body.get("completed") is False

    if target == "edge:unified-location-gap-repair":
        return _numeric(parsed_body.get("selected")) > 0

    if target == "edge:worker-dispatcher":
        return _numeric(parsed_body.get("claimed")) > 0

    return False


def _enqueue_continuation(envelope, target):
    now = int(time.time())
    current_depth = max(0, _numeric(envelope.get("chainDepth")))
    started_at = _numeric(envelope.get("chainStartedAt")) or now
    age_seconds = max(0, now - started_at)

    if current_depth >= MAX_CHAIN_DEPTH or age_seconds >= MAX_CHAIN_AGE_SECONDS:
        print(json.dumps({
            "event": "background_cron_continuation_stopped",
            "target": target,
            "chainDepth": current_depth,
            "chainAgeSeconds": age_seconds,
            "maxChainDepth": MAX_CHAIN_DEPTH,
            "maxChainAgeSeconds": MAX_CHAIN_AGE_SECONDS,
        }, separators=(",", ":")))
        return False

    continuation = dict(envelope)
    continuation["source"] = "background-cron-chain"
    continuation["chainDepth"] = current_depth + 1
    continuation["chainStartedAt"] = started_at
    response = sqs_client.send_message(
        QueueUrl=BACKGROUND_CRON_QUEUE_URL,
        MessageBody=json.dumps(continuation, separators=(",", ":")),
        DelaySeconds=2,
    )
    print(json.dumps({
        "event": "background_cron_continuation_queued",
        "target": target,
        "messageId": response.get("MessageId"),
        "chainDepth": continuation["chainDepth"],
        "chainAgeSeconds": age_seconds,
    }, separators=(",", ":")))
    return True


def _run_message(record):
    envelope = json.loads(record.get("body") or "{}")
    if envelope.get("version") != 1:
        raise ValueError("unsupported_background_cron_version")
    if envelope.get("jobType") != "background.cron":
        raise ValueError("unsupported_background_cron_job_type")

    target = str(envelope.get("target") or "").strip()
    if not target:
        raise ValueError("background_cron_target_missing")
    body = envelope.get("payload") or {}
    request_id = str(record.get("messageId") or "background-cron")

    if target.startswith("edge:"):
        event = _build_edge_http_event(target, body, request_id)
        function_name = EDGE_RUNTIME_FUNCTION_NAME
    else:
        event = _build_http_event(target, body, request_id)
        function_name = BACKGROUND_FUNCTION_NAME

    response = lambda_client.invoke(
        FunctionName=function_name,
        InvocationType="RequestResponse",
        Payload=json.dumps(event).encode("utf-8"),
    )
    payload = response["Payload"].read().decode("utf-8")
    if response.get("FunctionError"):
        raise RuntimeError(f"background_runtime_lambda_error:{payload[:1500]}")

    status, parsed_body = _parse_response(payload)
    if status >= 400:
        raise RuntimeError(f"background_cron_http_{status}:{str(parsed_body)[:1500]}")
    if isinstance(parsed_body, dict):
        if parsed_body.get("success") is False or parsed_body.get("ok") is False:
            raise RuntimeError(f"background_cron_declared_failure:{str(parsed_body)[:1500]}")

    if _should_continue(target, parsed_body):
        _enqueue_continuation(envelope, target)

    print(json.dumps({
        "event": "background_cron_completed",
        "target": target,
        "messageId": request_id,
        "status": status,
        "chainDepth": max(0, _numeric(envelope.get("chainDepth"))),
    }, separators=(",", ":")))


def handler(event, context):
    failures = []
    for record in event.get("Records") or []:
        message_id = str(record.get("messageId") or "")
        try:
            _run_message(record)
        except Exception as error:
            print(json.dumps({
                "event": "background_cron_failed",
                "messageId": message_id,
                "errorType": type(error).__name__,
                "error": str(error)[:1800],
            }, separators=(",", ":")))
            failures.append({"itemIdentifier": message_id})
    return {"batchItemFailures": failures}
