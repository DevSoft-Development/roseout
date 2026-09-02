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
from concurrent.futures import ThreadPoolExecutor

import boto3

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SHARED_SECRET_ARN = os.environ.get("SHARED_SECRET_ARN", "")
SUPABASE_SERVICE_ROLE_SECRET_ID = os.environ.get("SUPABASE_SERVICE_ROLE_SECRET_ID", "")
MAX_CLOCK_SKEW_SECONDS = 300
MAX_REQUEST_BODY_BYTES = 64_000
SUPABASE_TIMEOUT_SECONDS = 8
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
CONTEXT_KEYS = (
    "accountId",
    "contactId",
    "locationId",
    "opportunityId",
    "claimId",
    "supportCaseId",
    "taskId",
)

secrets = boto3.client("secretsmanager")
_secret_cache = {}


def response(status, payload):
    return {
        "statusCode": int(status),
        "headers": {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-toh-service": "core-api",
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


def valid_uuid(value):
    return isinstance(value, str) and UUID_RE.fullmatch(value) is not None


def sanitize_context(raw):
    if not isinstance(raw, dict):
        raise ValueError("context_object_required")
    context = {}
    for key in CONTEXT_KEYS:
        value = raw.get(key)
        if value is None:
            continue
        if not valid_uuid(value):
            raise ValueError(f"invalid_{key}")
        context[key] = value
    return_to = raw.get("returnTo")
    if isinstance(return_to, str) and return_to.startswith("/admin/dashboard/crm") and not return_to.startswith("//"):
        context["returnTo"] = return_to[:2_000]
    return context


def supabase_get(table, select, filters):
    if not SUPABASE_URL.startswith("https://"):
        raise RuntimeError("supabase_url_not_configured")
    service_role = load_secret(SUPABASE_SERVICE_ROLE_SECRET_ID)
    query = [("select", select)]
    for key, value in filters:
        query.append((key, value))
    query.append(("limit", "1"))
    url = f"{SUPABASE_URL}/rest/v1/{table}?{urllib.parse.urlencode(query)}"
    request = urllib.request.Request(
        url,
        method="GET",
        headers={
            "accept": "application/json",
            "apikey": service_role,
            "authorization": f"Bearer {service_role}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=SUPABASE_TIMEOUT_SECONDS) as upstream:
            payload = json.loads(upstream.read().decode("utf-8") or "[]")
    except urllib.error.HTTPError as exc:
        body = exc.read(1_500).decode("utf-8", errors="replace")
        raise RuntimeError(f"supabase_http_{exc.code}:{body}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("supabase_unavailable") from exc
    if not isinstance(payload, list):
        raise RuntimeError("supabase_response_invalid")
    return payload[0] if payload else None


def resolve_context(context):
    resolved = dict(context)
    if resolved.get("locationId") and not resolved.get("accountId"):
        relation = supabase_get(
            "crm_account_locations",
            "account_id",
            [("location_id", f"eq.{resolved['locationId']}"), ("status", "eq.active")],
        )
        if relation and valid_uuid(relation.get("account_id")):
            resolved["accountId"] = relation["account_id"]

    if resolved.get("opportunityId"):
        opportunity = supabase_get(
            "crm_opportunities",
            "account_id,primary_contact_id,primary_location_id",
            [("id", f"eq.{resolved['opportunityId']}")],
        )
        if opportunity:
            if not resolved.get("accountId") and valid_uuid(opportunity.get("account_id")):
                resolved["accountId"] = opportunity["account_id"]
            if not resolved.get("contactId") and valid_uuid(opportunity.get("primary_contact_id")):
                resolved["contactId"] = opportunity["primary_contact_id"]
            if not resolved.get("locationId") and valid_uuid(opportunity.get("primary_location_id")):
                resolved["locationId"] = opportunity["primary_location_id"]
    return resolved


def label_queries(context):
    queries = {
        "location": ("locations", "id,name,city,state", context.get("locationId")),
        "account": ("crm_accounts", "id,name", context.get("accountId")),
        "contact": ("crm_contacts", "id,full_name,email", context.get("contactId")),
        "opportunity": ("crm_opportunities", "id,name", context.get("opportunityId")),
    }

    def fetch(item):
        label, (table, select, record_id) = item
        if not record_id:
            return label, None
        return label, supabase_get(table, select, [("id", f"eq.{record_id}")])

    with ThreadPoolExecutor(max_workers=4) as pool:
        return dict(pool.map(fetch, queries.items()))


def crm_context(payload):
    context = sanitize_context(payload.get("context") or {})
    resolved = resolve_context(context)
    labels = label_queries(resolved)
    return response(200, {"context": resolved, "labels": labels})


def handler(event, context):
    body = raw_body(event)
    try:
        if not authenticate(event, body):
            return response(401, {"ok": False, "error": "unauthorized"})
    except Exception:
        return response(503, {"ok": False, "error": "core_api_auth_unavailable"})

    method = request_method(event)
    path = request_path(event)
    if method == "GET" and path == "/v1/status":
        return response(200, {
            "ok": True,
            "service": "theouthaven-core-api",
            "environment": ENVIRONMENT,
            "operations": ["crm.context"],
        })
    if method == "POST" and path == "/v1/crm/context":
        try:
            return crm_context(parse_json(body))
        except ValueError as exc:
            return response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return response(500, {"ok": False, "error": "crm_context_resolution_failed"})
    return response(404, {"ok": False, "error": "not_found"})
