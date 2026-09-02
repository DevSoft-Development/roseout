import json
import os
from datetime import datetime, timezone
from urllib.parse import urlsplit

import boto3
from botocore.config import Config

BACKGROUND_FUNCTION_NAME = os.environ["BACKGROUND_FUNCTION_NAME"]
APP_ENV_SECRET_NAME = os.environ["APP_ENV_SECRET_NAME"]
APP_ENV_SECRET_REGION = os.environ.get("APP_ENV_SECRET_REGION", "us-west-2")

lambda_client = boto3.client(
    "lambda",
    config=Config(
        connect_timeout=5,
        read_timeout=305,
        retries={"total_max_attempts": 1, "mode": "standard"},
    ),
)
secrets_client = boto3.client("secretsmanager", region_name=APP_ENV_SECRET_REGION)
_cron_secret = None


def _cron_secret_value():
    global _cron_secret
    if _cron_secret:
        return _cron_secret
    response = secrets_client.get_secret_value(SecretId=APP_ENV_SECRET_NAME)
    parsed = json.loads(response.get("SecretString") or "{}")
    secret = str(parsed.get("CRON_SECRET") or "").strip()
    if not secret:
        raise RuntimeError("background_app_environment_missing_cron_secret")
    _cron_secret = secret
    return secret


def _build_http_event(target, body, request_id):
    parsed = urlsplit(target)
    path = parsed.path or "/"
    if not path.startswith("/api/cron/"):
        raise ValueError("background_cron_target_not_allowed")
    if not isinstance(body, dict):
        raise ValueError("background_cron_body_must_be_object")

    method = "POST" if body else "GET"
    secret = _cron_secret_value()
    now = datetime.now(timezone.utc)
    event = {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "rawQueryString": parsed.query,
        "headers": {
            "content-type": "application/json",
            "authorization": f"Bearer {secret}",
            "x-cron-secret": secret,
            "x-toh-aws-internal": "background-cron-worker",
        },
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
    event = _build_http_event(target, body, request_id)

    response = lambda_client.invoke(
        FunctionName=BACKGROUND_FUNCTION_NAME,
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

    print(json.dumps({
        "event": "background_cron_completed",
        "target": target,
        "messageId": request_id,
        "status": status,
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
