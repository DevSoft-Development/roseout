import os

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

    return legacy_handler(event, context)
