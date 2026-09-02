import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request

import boto3

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
SHARED_SECRET_ARN = os.environ.get("SHARED_SECRET_ARN", "")
RUNTIME_PROVIDER_SECRET_ID = os.environ.get("RUNTIME_PROVIDER_SECRET_ID", "")
RUNTIME_PROVIDER_SECRET_REGION = os.environ.get("RUNTIME_PROVIDER_SECRET_REGION", "us-west-2")
MAX_CLOCK_SKEW_SECONDS = 300
MAX_REQUEST_BODY_BYTES = 512_000
MAX_RESPONSE_BODY_BYTES = 2_500_000
OPENAI_TIMEOUT_SECONDS = 55
ALLOWED_OPENAI_PATHS = {
    "/v1/openai/chat/completions": "/v1/chat/completions",
    "/v1/openai/responses": "/v1/responses",
    "/v1/openai/embeddings": "/v1/embeddings",
}
ALLOWED_MODEL_PREFIXES = (
    "gpt-",
    "o1",
    "o3",
    "o4",
    "text-embedding-",
)

secrets = boto3.client("secretsmanager")
provider_secrets = boto3.client("secretsmanager", region_name=RUNTIME_PROVIDER_SECRET_REGION)
_secret_cache = {}
_provider_cache = None


def response(status, payload, *, content_type="application/json"):
    body = payload if isinstance(payload, str) else json.dumps(payload)
    return {
        "statusCode": int(status),
        "headers": {
            "content-type": content_type,
            "cache-control": "no-store",
            "x-toh-service": "assistant-api",
        },
        "body": body,
    }


def raw_body(event):
    value = event.get("body") or ""
    if event.get("isBase64Encoded"):
        return base64.b64decode(value).decode("utf-8")
    return value


def request_method(event):
    return str(((event.get("requestContext") or {}).get("http") or {}).get("method") or "GET").upper()


def request_path(event):
    return str(event.get("rawPath") or event.get("path") or "/")


def load_secret(secret_id):
    if not secret_id:
        raise RuntimeError("assistant_secret_not_configured")
    cached = _secret_cache.get(secret_id)
    if cached:
        return cached
    value = secrets.get_secret_value(SecretId=secret_id).get("SecretString", "")
    if not value:
        raise RuntimeError("assistant_secret_empty")
    _secret_cache[secret_id] = value
    return value


def runtime_provider_env():
    global _provider_cache
    if _provider_cache is not None:
        return _provider_cache
    if not RUNTIME_PROVIDER_SECRET_ID:
        raise RuntimeError("assistant_provider_secret_not_configured")
    value = provider_secrets.get_secret_value(SecretId=RUNTIME_PROVIDER_SECRET_ID).get("SecretString", "")
    if not value:
        raise RuntimeError("assistant_provider_secret_empty")
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise RuntimeError("assistant_provider_secret_invalid")
    _provider_cache = parsed
    return parsed


def authenticate(event, body):
    headers = {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}
    timestamp = headers.get("x-toh-timestamp", "")
    signature = headers.get("x-toh-signature", "")
    try:
        epoch_ms = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs((time.time() * 1000) - epoch_ms) > MAX_CLOCK_SKEW_SECONDS * 1000:
        return False
    canonical = "\n".join([timestamp, request_method(event), request_path(event), body])
    secret = load_secret(SHARED_SECRET_ARN)
    expected = hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def parse_json(body):
    if len(body.encode("utf-8")) > MAX_REQUEST_BODY_BYTES:
        raise ValueError("request_too_large")
    try:
        value = json.loads(body or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("invalid_json") from exc
    if not isinstance(value, dict):
        raise ValueError("json_object_required")
    return value


def validate_model(payload):
    model = str(payload.get("model") or "").strip()
    if not model:
        raise ValueError("model_required")
    if len(model) > 120 or not model.startswith(ALLOWED_MODEL_PREFIXES):
        raise ValueError("model_not_allowed")
    if payload.get("stream") is True:
        raise ValueError("streaming_not_supported")
    return model


def openai_request(path, raw_payload):
    upstream_path = ALLOWED_OPENAI_PATHS.get(path)
    if not upstream_path:
        return response(404, {"error": {"message": "assistant_route_not_found", "type": "invalid_request_error"}})

    payload = parse_json(raw_payload)
    validate_model(payload)
    env = runtime_provider_env()
    api_key = str(env.get("OPENAI_API_KEY") or "").strip()
    if len(api_key) < 20:
        raise RuntimeError("openai_credential_not_configured")

    headers = {
        "authorization": f"Bearer {api_key}",
        "content-type": "application/json",
        "accept": "application/json",
        "user-agent": "TheOutHaven-AssistantAPI/1.0",
    }
    organization = str(env.get("OPENAI_ORGANIZATION") or env.get("OPENAI_ORG_ID") or "").strip()
    project = str(env.get("OPENAI_PROJECT") or env.get("OPENAI_PROJECT_ID") or "").strip()
    if organization:
        headers["openai-organization"] = organization
    if project:
        headers["openai-project"] = project

    request = urllib.request.Request(
        f"https://api.openai.com{upstream_path}",
        data=raw_payload.encode("utf-8"),
        method="POST",
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=OPENAI_TIMEOUT_SECONDS) as upstream:
            raw = upstream.read(MAX_RESPONSE_BODY_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BODY_BYTES:
                return response(502, {"error": {"message": "assistant_response_too_large", "type": "server_error"}})
            return response(upstream.status, raw.decode("utf-8", errors="replace"), content_type=upstream.headers.get("content-type", "application/json"))
    except urllib.error.HTTPError as exc:
        raw = exc.read(MAX_RESPONSE_BODY_BYTES).decode("utf-8", errors="replace")
        if not raw:
            raw = json.dumps({"error": {"message": f"openai_http_{exc.code}", "type": "server_error"}})
        return response(exc.code, raw, content_type=exc.headers.get("content-type", "application/json"))
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("openai_unavailable") from exc


def handler(event, context):
    method = request_method(event)
    path = request_path(event)
    body = raw_body(event)

    if method == "GET" and path in {"/healthz", "/v1/status"}:
        try:
            env = runtime_provider_env()
            openai_ready = len(str(env.get("OPENAI_API_KEY") or "").strip()) >= 20
        except Exception:
            openai_ready = False
        return response(200, {
            "ok": True,
            "service": "assistant-api",
            "environment": ENVIRONMENT,
            "providers": {
                "openai": {"configured": openai_ready},
                "huggingface": {"mode": "aws-search-ml"},
            },
        })

    if method != "POST":
        return response(405, {"error": {"message": "method_not_allowed", "type": "invalid_request_error"}})

    try:
        if not authenticate(event, body):
            return response(401, {"error": {"message": "unauthorized", "type": "authentication_error"}})
        return openai_request(path, body)
    except ValueError as exc:
        return response(400, {"error": {"message": str(exc), "type": "invalid_request_error"}})
    except Exception as exc:
        print(json.dumps({"level": "error", "service": "assistant-api", "error": type(exc).__name__, "detail": str(exc)[:300]}))
        return response(502, {"error": {"message": "assistant_upstream_unavailable", "type": "server_error"}})
