import os

from infrastructure_inventory import build_aws_infrastructure_overview
from platform_job_gateway import _authorized, _body, _response, handler as legacy_handler


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

    return legacy_handler(event, context)
