import json
import os

import boto3

from infrastructure_inventory import build_aws_infrastructure_overview
from platform_job_gateway import (
    ALLOWED_PROVIDERS,
    ENVIRONMENT,
    _authorized,
    _body,
    _credential_environment,
    _query,
    _read_credential,
    _response,
    handler as legacy_handler,
)


lambda_client = boto3.client("lambda")
BACKGROUND_INVOKER_FUNCTION = os.environ.get(
    "BACKGROUND_INVOKER_FUNCTION",
    f"toh-{ENVIRONMENT}-edge-scheduler-invoker",
)
ALLOWED_BACKGROUND_TARGETS = {
    "worker-dispatcher",
    "node:/api/cron/managed?job=website-replica-repair",
    "node:/api/cron/managed?job=search-phase13-maintenance",
    "node:/api/cron/managed?job=search-hf-inventory-maintenance",
    "node:/api/cron/managed?job=cron-alert-dispatcher",
}


def _runtime_snapshot(environment):
    providers = {}
    for provider in sorted(ALLOWED_PROVIDERS):
        value, _, _ = _read_credential(environment, provider)
        clean = {
            key: item
            for key, item in value.items()
            if key in ALLOWED_PROVIDERS[provider] and isinstance(item, str) and item.strip()
        }
        if clean:
            providers[provider] = clean
    return {"ok": True, "environment": environment, "providers": providers}


def _invoke_background(raw_body):
    payload = json.loads(raw_body or "{}")
    target = str(payload.get("function") or "").strip()
    if target not in ALLOWED_BACKGROUND_TARGETS:
        raise ValueError("unsupported_background_target")
    body = payload.get("body") or {}
    if not isinstance(body, dict):
        raise ValueError("invalid_background_body")

    response = lambda_client.invoke(
        FunctionName=BACKGROUND_INVOKER_FUNCTION,
        InvocationType="Event",
        Payload=json.dumps({"function": target, "body": body}, separators=(",", ":")).encode("utf-8"),
    )
    status = int(response.get("StatusCode") or 0)
    if status not in (200, 202):
        raise RuntimeError(f"background_invoke_http_{status}")
    return {
        "ok": True,
        "accepted": True,
        "function": target,
        "requestId": (response.get("ResponseMetadata") or {}).get("RequestId"),
    }


def handler(event, context):
    body = _body(event)
    if not _authorized(event, body):
        return _response(401, {"ok": False, "error": "unauthorized"})

    http = (event.get("requestContext") or {}).get("http") or {}
    method = str(http.get("method") or "GET").upper()
    path = str(event.get("rawPath") or "/")

    if method == "GET" and path == "/v1/infrastructure/aws":
        region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
        return _response(200, build_aws_infrastructure_overview(region))

    if method == "GET" and path == "/v1/credentials/runtime":
        environment = _credential_environment((_query(event).get("environment") or [ENVIRONMENT])[0])
        return _response(200, _runtime_snapshot(environment))

    if method == "POST" and path == "/v1/background/invoke":
        try:
            return _response(202, _invoke_background(body))
        except ValueError as error:
            return _response(400, {"ok": False, "error": str(error)})

    return legacy_handler(event, context)
