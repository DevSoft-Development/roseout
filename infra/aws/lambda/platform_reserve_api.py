import base64
import hashlib
import hmac
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

import boto3

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SHARED_SECRET_ARN = os.environ.get("SHARED_SECRET_ARN", "")
SUPABASE_SERVICE_ROLE_SECRET_ID = os.environ.get("SUPABASE_SERVICE_ROLE_SECRET_ID", "")
MAX_CLOCK_SKEW_SECONDS = 300
MAX_REQUEST_BODY_BYTES = 32_000
SUPABASE_TIMEOUT_SECONDS = 7
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)

secrets = boto3.client("secretsmanager")
_secret_cache = {}


def response(status, payload):
    return {
        "statusCode": int(status),
        "headers": {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-toh-service": "reserve-api",
        },
        "body": json.dumps(payload),
    }


def load_secret(secret_id):
    if not secret_id:
        raise RuntimeError("secret_not_configured")
    cached = _secret_cache.get(secret_id)
    if cached:
        return cached
    value = secrets.get_secret_value(SecretId=secret_id).get("SecretString", "")
    if not value:
        raise RuntimeError("secret_empty")
    _secret_cache[secret_id] = value
    return value


def raw_body(event):
    value = event.get("body") or ""
    if event.get("isBase64Encoded"):
        return base64.b64decode(value).decode("utf-8")
    return value


def request_method(event):
    return str(((event.get("requestContext") or {}).get("http") or {}).get("method") or "GET").upper()


def request_path(event):
    return str(event.get("rawPath") or event.get("path") or "/")


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
    expected = hmac.new(load_secret(SHARED_SECRET_ARN).encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def parse_json(body):
    if len(body.encode("utf-8")) > MAX_REQUEST_BODY_BYTES:
        raise ValueError("request_too_large")
    try:
        payload = json.loads(body or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("invalid_json") from exc
    if not isinstance(payload, dict):
        raise ValueError("json_object_required")
    return payload


def valid_uuid(value, *, nullable=False):
    if nullable and value in (None, ""):
        return True
    return isinstance(value, str) and UUID_RE.fullmatch(value) is not None


def supabase_rpc(name, payload):
    if not SUPABASE_URL.startswith("https://"):
        raise RuntimeError("supabase_url_not_configured")
    service_role = load_secret(SUPABASE_SERVICE_ROLE_SECRET_ID)
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/{urllib.parse.quote(name)}",
        data=body,
        method="POST",
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "apikey": service_role,
            "authorization": f"Bearer {service_role}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=SUPABASE_TIMEOUT_SECONDS) as upstream:
            raw = upstream.read().decode("utf-8") or "null"
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        text = exc.read(2_000).decode("utf-8", errors="replace")
        try:
            detail = json.loads(text)
            message = detail.get("message") or detail.get("error") or text
        except json.JSONDecodeError:
            message = text
        if 400 <= exc.code < 500:
            raise ValueError(str(message)) from exc
        raise RuntimeError(f"supabase_http_{exc.code}:{message}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("supabase_unavailable") from exc


def assign_resource(payload):
    reservation_id = payload.get("reservationId")
    location_id = payload.get("locationId")
    resource_id = payload.get("resourceId")
    staff_profile_id = payload.get("staffProfileId")
    if not valid_uuid(reservation_id) or not valid_uuid(location_id):
        raise ValueError("invalid_reservation_context")
    if not valid_uuid(resource_id, nullable=True) or not valid_uuid(staff_profile_id, nullable=True):
        raise ValueError("invalid_resource_or_staff_id")
    label = str(payload.get("resourceLabel") or "").strip()
    resource_type = str(payload.get("resourceType") or "table").strip()
    if not label or len(label) > 160 or len(resource_type) > 40:
        raise ValueError("invalid_resource")
    capacity = payload.get("resourceCapacity")
    if capacity is not None:
        capacity = int(capacity)
        if capacity < 1 or capacity > 500:
            raise ValueError("invalid_capacity")
    override_reason = payload.get("overrideReason")
    if override_reason is not None:
        override_reason = str(override_reason).strip()[:500] or None
    result = supabase_rpc("reserve_assign_resource_atomic", {
        "p_reservation_id": reservation_id,
        "p_location_id": location_id,
        "p_resource_id": resource_id,
        "p_resource_label": label,
        "p_resource_type": resource_type,
        "p_resource_capacity": capacity,
        "p_seat_after_assign": payload.get("seatAfterAssign") is not False,
        "p_staff_profile_id": staff_profile_id,
        "p_override_reason": override_reason,
    })
    return response(200, {"success": True, "reservation": result})


def assign_server(payload):
    reservation_id = payload.get("reservationId")
    location_id = payload.get("locationId")
    server_id = payload.get("serverStaffProfileId")
    actor_id = payload.get("actorStaffProfileId")
    if not all(valid_uuid(value) for value in (reservation_id, location_id, server_id)):
        raise ValueError("invalid_server_assignment")
    if not valid_uuid(actor_id, nullable=True):
        raise ValueError("invalid_actor_staff_id")
    result = supabase_rpc("reserve_assign_server", {
        "p_reservation_id": reservation_id,
        "p_location_id": location_id,
        "p_server_staff_profile_id": server_id,
        "p_actor_staff_profile_id": actor_id,
    })
    return response(200, {"success": True, "reservation": result})


def handler(event, context):
    body = raw_body(event)
    path = request_path(event)
    method = request_method(event)
    try:
        if not authenticate(event, body):
            return response(401, {"success": False, "error": "unauthorized"})
        if method == "GET" and path == "/healthz":
            return response(200, {"ok": True, "service": "reserve-api", "environment": ENVIRONMENT})
        payload = parse_json(body)
        if method == "POST" and path == "/v1/reserve/assign":
            return assign_resource(payload)
        if method == "POST" and path == "/v1/reserve/assign-server":
            return assign_server(payload)
        return response(404, {"success": False, "error": "not_found"})
    except ValueError as exc:
        return response(409 if "assigned" in str(exc).lower() or "conflict" in str(exc).lower() else 400, {"success": False, "error": str(exc)})
    except Exception as exc:
        print(json.dumps({"level": "error", "service": "reserve-api", "error": str(exc)}))
        return response(503, {"success": False, "error": "reserve_api_unavailable"})
