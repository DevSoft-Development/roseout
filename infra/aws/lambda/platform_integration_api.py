import base64
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError, as_completed
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
from botocore.exceptions import ClientError

from google_places_provider import (
    details as google_places_details,
    photo_media as google_places_photo_media,
    photo_metadata as google_places_photo_metadata,
    search_text as google_places_search_text,
    status as google_places_status,
)
from telnyx_provider import (
    send_message as telnyx_send_message,
    status as telnyx_status,
    verify_channels as telnyx_verify_channels,
)

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
SHARED_SECRET_ARN = os.environ.get("SHARED_SECRET_ARN", "")
STRIPE_SECRET_ARN = os.environ.get("STRIPE_SECRET_ARN", "")
RUNTIME_PROVIDER_SECRET_ID = os.environ.get(
    "RUNTIME_PROVIDER_SECRET_ID",
    f"/theouthaven/{ENVIRONMENT}/platform-dr/app-env",
)
RUNTIME_PROVIDER_SECRET_REGION = os.environ.get("RUNTIME_PROVIDER_SECRET_REGION", "us-west-2")
MAX_CLOCK_SKEW_SECONDS = 300
MAX_REQUEST_BODY_BYTES = 2_000_000
MAX_UPSTREAM_BODY_BYTES = 1_500_000
UPSTREAM_TIMEOUT_SECONDS = 12
STRIPE_REQUEST_TIMEOUT_SECONDS = 12
STRIPE_SNAPSHOT_TIMEOUT_SECONDS = 14
STRIPE_MAX_WORKERS = 10
MAX_STRIPE_ACCOUNTS = 200
STRIPE_API_VERSION = "2026-07-29.dahlia"
STAMPS_CREDENTIAL_SECRET_ID = os.environ.get("STAMPS_CREDENTIAL_SECRET_ID", f"/theouthaven/credential-vault/{ENVIRONMENT}/stamps")
STAMPS_V160_NAMESPACE = "http://stamps.com/xml/namespace/2026/06/swsim/SwsimV160"
STAMPS_PRODUCTION_ENDPOINT = "https://swsim.stamps.com/swsim/swsimv160.asmx"
STAMPS_PRODUCTION_WSDL = f"{STAMPS_PRODUCTION_ENDPOINT}?wsdl"
STAMPS_REQUEST_TIMEOUT_SECONDS = 12
MAX_STAMPS_XML_BYTES = 2_000_000
ALLOWED_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}
ALLOWED_GRAPH_VERSIONS = {"v1.0", "beta"}
ALLOWED_FORWARD_HEADERS = {
    "accept",
    "content-type",
    "prefer",
    "consistencylevel",
    "if-match",
    "if-none-match",
}
STRIPE_ACCOUNT_RE = re.compile(r"^acct_[A-Za-z0-9]+$")
STRIPE_ALLOWED_V1_PREFIXES = (
    "/account_links",
    "/account_sessions",
    "/accounts",
    "/balance",
    "/billing_portal/sessions",
    "/charges",
    "/checkout/sessions",
    "/customers",
    "/payment_intents",
    "/payment_methods",
    "/payouts",
    "/prices",
    "/products",
    "/refunds",
    "/setup_intents",
    "/subscription_items",
    "/subscriptions",
)
STRIPE_ALLOWED_V2_PREFIXES = (
    "/core/accounts",
    "/core/account_links",
)
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

secrets = boto3.client("secretsmanager")
provider_secrets = boto3.client("secretsmanager", region_name=RUNTIME_PROVIDER_SECRET_REGION)
_cached_secret = None
_cached_stripe_secret = None
_cached_runtime_provider_secret = None
_cached_microsoft_app_tokens = {}


def response(
    status,
    payload=None,
    *,
    content_type="application/json",
    raw_body=None,
    extra_headers=None,
    is_base64_encoded=False,
):
    headers = {
        "content-type": content_type,
        "cache-control": "no-store",
        "x-toh-service": "integration-api",
    }
    if extra_headers:
        headers.update(extra_headers)
    if raw_body is not None:
        body = raw_body
    else:
        body = json.dumps(payload if payload is not None else {})
    result = {"statusCode": int(status), "headers": headers, "body": body}
    if is_base64_encoded:
        result["isBase64Encoded"] = True
    return result


def load_secret():
    global _cached_secret
    if _cached_secret:
        return _cached_secret
    if not SHARED_SECRET_ARN:
        raise RuntimeError("integration_api_secret_not_configured")
    secret = secrets.get_secret_value(SecretId=SHARED_SECRET_ARN).get("SecretString", "")
    if len(secret) < 32:
        raise RuntimeError("integration_api_secret_invalid")
    _cached_secret = secret
    return secret


def load_stripe_secret():
    global _cached_stripe_secret
    if _cached_stripe_secret:
        return _cached_stripe_secret
    if not STRIPE_SECRET_ARN:
        raise RuntimeError("stripe_secret_not_configured")
    secret = str(secrets.get_secret_value(SecretId=STRIPE_SECRET_ARN).get("SecretString", "") or "").strip()
    if len(secret) < 16:
        raise RuntimeError("stripe_secret_invalid")
    _cached_stripe_secret = secret
    return secret


def load_runtime_provider_secret():
    global _cached_runtime_provider_secret
    if _cached_runtime_provider_secret is not None:
        return _cached_runtime_provider_secret
    if not RUNTIME_PROVIDER_SECRET_ID:
        _cached_runtime_provider_secret = {}
        return _cached_runtime_provider_secret
    try:
        raw = provider_secrets.get_secret_value(SecretId=RUNTIME_PROVIDER_SECRET_ID).get("SecretString", "")
        payload = json.loads(raw or "{}")
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    _cached_runtime_provider_secret = payload
    return payload


def runtime_value(*names):
    source = load_runtime_provider_secret()
    for name in names:
        value = str(source.get(name) or "").strip()
        if value:
            return value
    return ""


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
    expected = hmac.new(load_secret().encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
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


def normalize_graph_path(value, version):
    path = str(value or "").strip()
    if not path.startswith("/"):
        raise ValueError("graph_path_must_be_relative")
    if "://" in path or "\\" in path or "\r" in path or "\n" in path:
        raise ValueError("graph_path_invalid")
    lowered = path.lower()
    if lowered.startswith("/v1.0/"):
        if version != "v1.0":
            raise ValueError("graph_version_mismatch")
        path = path[len("/v1.0"):]
    elif lowered.startswith("/beta/"):
        if version != "beta":
            raise ValueError("graph_version_mismatch")
        path = path[len("/beta"):]
    return path


def graph_upstream(access_token, version, path, method="GET", headers=None, upstream_body=None):
    if version not in ALLOWED_GRAPH_VERSIONS:
        return response(400, {"ok": False, "error": "graph_version_invalid"})
    try:
        normalized_path = normalize_graph_path(path, version)
    except ValueError as exc:
        return response(400, {"ok": False, "error": str(exc)})
    method = str(method or "GET").upper()
    if not access_token:
        return response(400, {"ok": False, "error": "access_token_required"})
    if method not in ALLOWED_METHODS:
        return response(400, {"ok": False, "error": "graph_method_invalid"})

    forwarded = {}
    supplied_headers = headers or {}
    if not isinstance(supplied_headers, dict):
        return response(400, {"ok": False, "error": "headers_object_required"})
    for key, value in supplied_headers.items():
        normalized = str(key).lower()
        if normalized in ALLOWED_FORWARD_HEADERS:
            forwarded[normalized] = str(value)

    if upstream_body is not None and not isinstance(upstream_body, str):
        upstream_body = json.dumps(upstream_body, separators=(",", ":"))
    encoded_body = upstream_body.encode("utf-8") if upstream_body is not None else None
    if encoded_body is not None and len(encoded_body) > MAX_REQUEST_BODY_BYTES:
        return response(413, {"ok": False, "error": "upstream_body_too_large"})

    url = f"https://graph.microsoft.com/{version}{normalized_path}"
    request_headers = {
        "accept": forwarded.pop("accept", "application/json"),
        "authorization": f"Bearer {access_token}",
        **forwarded,
    }
    if encoded_body is not None and "content-type" not in request_headers:
        request_headers["content-type"] = "application/json"

    request = urllib.request.Request(url, data=encoded_body, method=method, headers=request_headers)
    try:
        upstream = urllib.request.urlopen(request, timeout=UPSTREAM_TIMEOUT_SECONDS)
        status = upstream.status
        body_bytes = upstream.read(MAX_UPSTREAM_BODY_BYTES + 1)
        content_type = upstream.headers.get("content-type", "application/json")
    except urllib.error.HTTPError as exc:
        status = exc.code
        body_bytes = exc.read(MAX_UPSTREAM_BODY_BYTES + 1)
        content_type = exc.headers.get("content-type", "application/json") if exc.headers else "application/json"
    except (urllib.error.URLError, TimeoutError):
        return response(502, {"ok": False, "error": "microsoft_graph_unavailable"})

    if len(body_bytes) > MAX_UPSTREAM_BODY_BYTES:
        return response(502, {"ok": False, "error": "microsoft_graph_response_too_large"})
    body_text = body_bytes.decode("utf-8", errors="replace")
    return response(
        status,
        content_type=content_type,
        raw_body=body_text,
        extra_headers={"x-toh-upstream": "microsoft-graph"},
    )


def graph_request(payload):
    return graph_upstream(
        str(payload.get("accessToken") or "").strip(),
        str(payload.get("version") or "v1.0").strip(),
        payload.get("path"),
        payload.get("method") or "GET",
        payload.get("headers") or {},
        payload.get("body"),
    )


def microsoft_credentials(credential_set="default"):
    provisioning = credential_set == "provisioning"
    tenant_id = runtime_value("M365_TENANT_ID", "MICROSOFT_TENANT_ID", "AZURE_TENANT_ID")
    if provisioning:
        client_id = runtime_value("M365_PROVISIONING_CLIENT_ID", "M365_CLIENT_ID", "MICROSOFT_CLIENT_ID", "AZURE_CLIENT_ID")
        client_secret = runtime_value("M365_PROVISIONING_CLIENT_SECRET", "M365_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET", "AZURE_CLIENT_SECRET")
    else:
        client_id = runtime_value("M365_CLIENT_ID", "MICROSOFT_CLIENT_ID", "AZURE_CLIENT_ID")
        client_secret = runtime_value("M365_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET", "AZURE_CLIENT_SECRET")
    if not tenant_id or not client_id or not client_secret:
        raise RuntimeError("microsoft_credentials_not_configured")
    return tenant_id, client_id, client_secret


def microsoft_token_request(payload):
    grant_type = str(payload.get("grantType") or "").strip()
    credential_set = str(payload.get("credentialSet") or "default").strip()
    tenant_id, client_id, client_secret = microsoft_credentials(credential_set)
    scope = str(payload.get("scope") or "").strip()
    params = {"client_id": client_id, "client_secret": client_secret, "grant_type": grant_type}
    if scope:
        params["scope"] = scope
    if grant_type == "authorization_code":
        code = str(payload.get("code") or "").strip()
        code_verifier = str(payload.get("codeVerifier") or "").strip()
        redirect_uri = str(payload.get("redirectUri") or "").strip()
        if not code or not code_verifier or not redirect_uri:
            raise ValueError("microsoft_authorization_code_fields_required")
        params.update({"code": code, "code_verifier": code_verifier, "redirect_uri": redirect_uri})
    elif grant_type == "refresh_token":
        refresh_token = str(payload.get("refreshToken") or "").strip()
        redirect_uri = str(payload.get("redirectUri") or "").strip()
        if not refresh_token:
            raise ValueError("microsoft_refresh_token_required")
        params["refresh_token"] = refresh_token
        if redirect_uri:
            params["redirect_uri"] = redirect_uri
    elif grant_type == "client_credentials":
        params["scope"] = scope or "https://graph.microsoft.com/.default"
    else:
        raise ValueError("microsoft_grant_type_invalid")

    encoded = urllib.parse.urlencode(params).encode("utf-8")
    url = f"https://login.microsoftonline.com/{urllib.parse.quote(tenant_id, safe='')}/oauth2/v2.0/token"
    request = urllib.request.Request(url, data=encoded, method="POST", headers={"content-type": "application/x-www-form-urlencoded", "accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=UPSTREAM_TIMEOUT_SECONDS) as upstream:
            status = upstream.status
            body_bytes = upstream.read(MAX_UPSTREAM_BODY_BYTES + 1)
    except urllib.error.HTTPError as exc:
        status = exc.code
        body_bytes = exc.read(MAX_UPSTREAM_BODY_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("microsoft_token_unavailable") from exc
    if len(body_bytes) > MAX_UPSTREAM_BODY_BYTES:
        raise RuntimeError("microsoft_token_response_too_large")
    try:
        result = json.loads(body_bytes.decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise RuntimeError("microsoft_token_response_invalid") from exc
    if status < 200 or status >= 300 or not isinstance(result, dict) or not result.get("access_token"):
        detail = str(result.get("error_description") or result.get("error") or f"HTTP {status}")[:500] if isinstance(result, dict) else f"HTTP {status}"
        raise RuntimeError(f"microsoft_token_failed:{detail}")
    return result


def microsoft_app_token(credential_set="provisioning"):
    cache_key = credential_set
    cached = _cached_microsoft_app_tokens.get(cache_key)
    if cached and cached.get("expires_at", 0) > time.time() + 60:
        return cached["access_token"]
    token = microsoft_token_request({"grantType": "client_credentials", "credentialSet": credential_set, "scope": "https://graph.microsoft.com/.default"})
    access_token = str(token.get("access_token") or "")
    expires_in = int(token.get("expires_in") or 3600)
    _cached_microsoft_app_tokens[cache_key] = {"access_token": access_token, "expires_at": time.time() + max(60, expires_in - 120)}
    return access_token


def microsoft_app_graph(payload):
    credential_set = str(payload.get("credentialSet") or "provisioning").strip()
    access_token = microsoft_app_token(credential_set)
    return graph_upstream(
        access_token,
        str(payload.get("version") or "v1.0").strip(),
        payload.get("path"),
        payload.get("method") or "GET",
        payload.get("headers") or {},
        payload.get("body"),
    )


def decode_jwt_payload(token):
    parts = str(token or "").split(".")
    if len(parts) < 2:
        return {}
    raw = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(raw.encode("ascii")).decode("utf-8"))
    except Exception:
        return {}


def microsoft_app_readiness():
    tenant_id, _, _ = microsoft_credentials("provisioning")
    access_token = microsoft_app_token("provisioning")
    claims = decode_jwt_payload(access_token)
    roles = claims.get("roles") if isinstance(claims.get("roles"), list) else []
    tenant_matches = not claims.get("tid") or str(claims.get("tid")).lower() == tenant_id.lower()
    graph_result = graph_upstream(access_token, "v1.0", "/users?$top=1&$select=id,userPrincipalName,accountEnabled", "GET")
    graph_ok = int(graph_result.get("statusCode") or 500) < 300
    return {
        "ok": tenant_matches and graph_ok,
        "provider": "microsoft-graph",
        "tenantMatches": tenant_matches,
        "graphUserRead": graph_ok,
        "roles": [str(role) for role in roles if isinstance(role, str)],
        "licenseSku": runtime_value("M365_EMPLOYEE_LICENSE_SKU_ID") or None,
    }


def stripe_error_message(status, body_bytes):
    try:
        payload = json.loads(body_bytes.decode("utf-8", errors="replace") or "{}")
        error = payload.get("error") if isinstance(payload, dict) else None
        message = error.get("message") if isinstance(error, dict) else None
        if message:
            return str(message)[:300]
    except json.JSONDecodeError:
        pass
    return f"Stripe request failed ({status})"


def stripe_key(mode="live"):
    if mode == "live":
        return load_stripe_secret()
    if mode == "test":
        key = runtime_value("STRIPE_TEST_SECRET_KEY")
        if len(key) < 16:
            raise RuntimeError("stripe_test_secret_not_configured")
        return key
    raise ValueError("stripe_mode_invalid")


def normalize_stripe_path(path, api_version):
    raw = str(path or "").strip()
    if not raw.startswith("/") or "://" in raw or "\\" in raw or "\r" in raw or "\n" in raw:
        raise ValueError("stripe_path_invalid")
    prefixes = STRIPE_ALLOWED_V2_PREFIXES if api_version == "v2" else STRIPE_ALLOWED_V1_PREFIXES
    base_path = raw.split("?", 1)[0]
    if not any(base_path == prefix or base_path.startswith(prefix + "/") for prefix in prefixes):
        raise ValueError("stripe_path_not_allowed")
    return raw


def stripe_request_proxy(payload):
    api_version = str(payload.get("apiVersion") or "v1").strip()
    if api_version not in {"v1", "v2"}:
        raise ValueError("stripe_api_version_invalid")
    mode = str(payload.get("mode") or "live").strip()
    method = str(payload.get("method") or "POST").upper()
    if method not in {"GET", "POST"}:
        raise ValueError("stripe_method_invalid")
    path = normalize_stripe_path(payload.get("path"), api_version)
    stripe_account = str(payload.get("stripeAccount") or "").strip()
    if stripe_account and not STRIPE_ACCOUNT_RE.fullmatch(stripe_account):
        raise ValueError("invalid_stripe_account_id")
    idempotency_key = str(payload.get("idempotencyKey") or "").strip()
    if len(idempotency_key) > 255:
        raise ValueError("stripe_idempotency_key_too_long")

    headers = {"accept": "application/json", "authorization": f"Bearer {stripe_key(mode)}"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    if stripe_account:
        headers["Stripe-Account"] = stripe_account
    encoded_body = None
    if api_version == "v2":
        headers["Stripe-Version"] = STRIPE_API_VERSION
        body_value = payload.get("body")
        if body_value is not None:
            if not isinstance(body_value, dict):
                raise ValueError("stripe_v2_body_object_required")
            encoded_body = json.dumps(body_value, separators=(",", ":")).encode("utf-8")
            headers["content-type"] = "application/json"
    else:
        form = payload.get("form")
        if form is not None:
            if not isinstance(form, str):
                raise ValueError("stripe_form_string_required")
            if len(form.encode("utf-8")) > MAX_REQUEST_BODY_BYTES:
                raise ValueError("stripe_body_too_large")
            encoded_body = form.encode("utf-8")
            headers["content-type"] = "application/x-www-form-urlencoded"

    base = "https://api.stripe.com/v2" if api_version == "v2" else "https://api.stripe.com/v1"
    request = urllib.request.Request(base + path, data=encoded_body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=STRIPE_REQUEST_TIMEOUT_SECONDS) as upstream:
            status = upstream.status
            body_bytes = upstream.read(MAX_UPSTREAM_BODY_BYTES + 1)
    except urllib.error.HTTPError as exc:
        status = exc.code
        body_bytes = exc.read(MAX_UPSTREAM_BODY_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("stripe_unavailable") from exc
    if len(body_bytes) > MAX_UPSTREAM_BODY_BYTES:
        raise RuntimeError("stripe_response_too_large")
    try:
        result = json.loads(body_bytes.decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise RuntimeError("stripe_response_invalid") from exc
    if status < 200 or status >= 300:
        raise RuntimeError(stripe_error_message(status, body_bytes))
    if not isinstance(result, dict):
        raise RuntimeError("stripe_response_invalid")
    return result


def stripe_get(path, account_id=None):
    return stripe_request_proxy({"apiVersion": "v1", "mode": "live", "method": "GET", "path": path, "stripeAccount": account_id or None})


def normalize_balance_items(value):
    items = value if isinstance(value, list) else []
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            amount = int(item.get("amount") or 0)
        except (TypeError, ValueError):
            amount = 0
        currency = str(item.get("currency") or "").strip().lower()
        if currency:
            result.append({"amount": amount, "currency": currency})
    return result


def normalize_payout(value):
    if not isinstance(value, dict):
        return None
    payout_id = str(value.get("id") or "").strip()
    if not payout_id:
        return None
    try:
        amount = int(value.get("amount") or 0)
    except (TypeError, ValueError):
        amount = 0
    return {
        "id": payout_id,
        "amount": amount,
        "currency": str(value.get("currency") or "usd").lower(),
        "status": str(value.get("status") or "unknown"),
        "arrival_date": value.get("arrival_date"),
        "created": value.get("created"),
        "method": value.get("method"),
        "type": value.get("type"),
        "failure_code": value.get("failure_code"),
        "failure_message": value.get("failure_message"),
        "destination": value.get("destination") if isinstance(value.get("destination"), str) else None,
    }


def stripe_account_snapshot(account_id):
    try:
        balance = stripe_get("/balance", account_id)
        payouts_payload = stripe_get("/payouts?limit=10", account_id)
        payout_rows = payouts_payload.get("data") if isinstance(payouts_payload.get("data"), list) else []
        payouts = [item for item in (normalize_payout(row) for row in payout_rows) if item]
        return {"accountId": account_id, "available": normalize_balance_items(balance.get("available")), "pending": normalize_balance_items(balance.get("pending")), "payouts": payouts, "error": None}
    except Exception as exc:
        return {"accountId": account_id, "available": [], "pending": [], "payouts": [], "error": str(exc)[:300] or "Unable to read Stripe account"}


def normalize_account_ids(payload):
    raw = payload.get("accountIds") or []
    if not isinstance(raw, list):
        raise ValueError("accountIds_array_required")
    if len(raw) > MAX_STRIPE_ACCOUNTS:
        raise ValueError("too_many_stripe_accounts")
    result = []
    seen = set()
    for value in raw:
        account_id = str(value or "").strip()
        if not STRIPE_ACCOUNT_RE.fullmatch(account_id):
            raise ValueError("invalid_stripe_account_id")
        if account_id not in seen:
            seen.add(account_id)
            result.append(account_id)
    return result


def stripe_connect_snapshot(payload):
    account_ids = normalize_account_ids(payload)
    if not account_ids:
        return {"ok": True, "snapshots": [], "partial": False}
    snapshots = {}
    executor = ThreadPoolExecutor(max_workers=min(STRIPE_MAX_WORKERS, len(account_ids)))
    future_to_account = {executor.submit(stripe_account_snapshot, account_id): account_id for account_id in account_ids}
    timed_out = False
    try:
        for future in as_completed(future_to_account, timeout=STRIPE_SNAPSHOT_TIMEOUT_SECONDS):
            account_id = future_to_account[future]
            try:
                snapshots[account_id] = future.result()
            except Exception:
                snapshots[account_id] = {"accountId": account_id, "available": [], "pending": [], "payouts": [], "error": "Unable to read Stripe account"}
    except FuturesTimeoutError:
        timed_out = True
    finally:
        for future, account_id in future_to_account.items():
            if account_id not in snapshots:
                future.cancel()
                snapshots[account_id] = {"accountId": account_id, "available": [], "pending": [], "payouts": [], "error": "Stripe snapshot timed out"}
        executor.shutdown(wait=False, cancel_futures=True)
    return {"ok": True, "snapshots": [snapshots[account_id] for account_id in account_ids], "partial": timed_out or any(item.get("error") for item in snapshots.values())}


def stripe_status():
    load_stripe_secret()
    return {"ok": True, "provider": "stripe-connect", "credentialConfigured": True}


def normalize_email_list(value, field_name, max_count=50):
    raw = value if isinstance(value, list) else [value]
    result = []
    for item in raw:
        clean = str(item or "").strip()
        if not clean:
            continue
        if len(clean) > 320 or not EMAIL_RE.fullmatch(clean):
            raise ValueError(f"{field_name}_invalid")
        if clean not in result:
            result.append(clean)
    if not result and field_name == "to":
        raise ValueError("email_recipient_required")
    if len(result) > max_count:
        raise ValueError(f"{field_name}_too_many")
    return result


def resend_send(payload):
    api_key = runtime_value("RESEND_API_KEY")
    if len(api_key) < 16:
        raise RuntimeError("resend_not_configured")
    sender = str(payload.get("from") or "").strip()
    subject = str(payload.get("subject") or "").strip()
    html = payload.get("html")
    text = payload.get("text")
    if not sender or len(sender) > 500:
        raise ValueError("email_from_invalid")
    if not subject or len(subject) > 998:
        raise ValueError("email_subject_invalid")
    if html is None and text is None:
        raise ValueError("email_body_required")
    if isinstance(html, str) and len(html.encode("utf-8")) > 1_500_000:
        raise ValueError("email_html_too_large")
    if isinstance(text, str) and len(text.encode("utf-8")) > 500_000:
        raise ValueError("email_text_too_large")
    email_body = {"from": sender, "to": normalize_email_list(payload.get("to"), "to"), "subject": subject}
    cc = normalize_email_list(payload.get("cc") or [], "cc")
    bcc = normalize_email_list(payload.get("bcc") or [], "bcc")
    if cc:
        email_body["cc"] = cc
    if bcc:
        email_body["bcc"] = bcc
    reply_to = str(payload.get("replyTo") or payload.get("reply_to") or "").strip()
    if reply_to:
        if len(reply_to) > 320 or not EMAIL_RE.fullmatch(reply_to):
            raise ValueError("email_reply_to_invalid")
        email_body["reply_to"] = reply_to
    if html is not None:
        email_body["html"] = str(html)
    if text is not None:
        email_body["text"] = str(text)

    encoded = json.dumps(email_body, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request("https://api.resend.com/emails", data=encoded, method="POST", headers={"authorization": f"Bearer {api_key}", "content-type": "application/json", "accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=UPSTREAM_TIMEOUT_SECONDS) as upstream:
            status = upstream.status
            body_bytes = upstream.read(MAX_UPSTREAM_BODY_BYTES + 1)
    except urllib.error.HTTPError as exc:
        status = exc.code
        body_bytes = exc.read(MAX_UPSTREAM_BODY_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("resend_unavailable") from exc
    if len(body_bytes) > MAX_UPSTREAM_BODY_BYTES:
        raise RuntimeError("resend_response_too_large")
    try:
        result = json.loads(body_bytes.decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise RuntimeError("resend_response_invalid") from exc
    if status < 200 or status >= 300:
        detail = str(result.get("message") or result.get("name") or f"HTTP {status}")[:300] if isinstance(result, dict) else f"HTTP {status}"
        raise RuntimeError(f"resend_send_failed:{detail}")
    if not isinstance(result, dict):
        raise RuntimeError("resend_response_invalid")
    return {"ok": True, "provider": "resend", "id": result.get("id")}


def google_json_route(route, body):
    try:
        return response(200, route(parse_json(body)))
    except ValueError as exc:
        return response(400, {"ok": False, "error": str(exc)})
    except Exception:
        return response(502, {"ok": False, "error": "google_places_unavailable"})


def telnyx_json_route(route, body):
    try:
        return response(200, route(parse_json(body)))
    except ValueError as exc:
        return response(400, {"ok": False, "error": str(exc)})
    except Exception:
        return response(502, {"ok": False, "error": "telnyx_unavailable"})



def _stamps_clean(value):
    return str(value or "").strip()


def _stamps_xml(value):
    return (
        _stamps_clean(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _stamps_read_xml_tag(xml_text, tag):
    safe_tag = re.escape(tag)
    match = re.search(
        rf"<(?:[A-Za-z0-9_-]+:)?{safe_tag}(?:\s[^>]*)?>([\s\S]*?)</(?:[A-Za-z0-9_-]+:)?{safe_tag}>",
        xml_text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    return (
        match.group(1).strip()
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&apos;", "'")
        .replace("&amp;", "&")
    )


def _load_stamps_credentials(*, missing_ok=False):
    try:
        raw = _stamps_clean(secrets.get_secret_value(SecretId=STAMPS_CREDENTIAL_SECRET_ID).get("SecretString", ""))
    except ClientError as exc:
        if missing_ok and exc.response.get("Error", {}).get("Code") == "ResourceNotFoundException":
            return {"integrationId": "", "username": "", "password": ""}
        raise
    if not raw:
        return {"integrationId": "", "username": "", "password": ""}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("stamps_credential_secret_invalid_json") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("stamps_credential_secret_invalid")
    return {
        "integrationId": _stamps_clean(payload.get("integrationId")),
        "username": _stamps_clean(payload.get("username")),
        "password": _stamps_clean(payload.get("password")),
    }


def _stamps_credentials_configured(credentials):
    return bool(credentials.get("integrationId") and credentials.get("username") and credentials.get("password"))


def _validate_stamps_wsdl():
    request = urllib.request.Request(
        STAMPS_PRODUCTION_WSDL,
        method="GET",
        headers={"Accept": "text/xml,application/xml", "User-Agent": "TheOutHaven/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=STAMPS_REQUEST_TIMEOUT_SECONDS) as upstream:
            body = upstream.read(MAX_STAMPS_XML_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("stamps_wsdl_unavailable") from exc
    if len(body) > MAX_STAMPS_XML_BYTES:
        raise RuntimeError("stamps_wsdl_too_large")
    wsdl = body.decode("utf-8", errors="replace")
    match = re.search(r"targetNamespace=[\"']([^\"']+)[\"']", wsdl, flags=re.IGNORECASE)
    if not match or match.group(1) != STAMPS_V160_NAMESPACE:
        raise RuntimeError("stamps_wsdl_namespace_mismatch")


def _stamps_get_account_info(credentials):
    if not _stamps_credentials_configured(credentials):
        raise RuntimeError("stamps_credentials_not_configured")
    _validate_stamps_wsdl()
    credentials_xml = (
        "<sws:Credentials>"
        f"<sws:IntegrationID>{_stamps_xml(credentials['integrationId'])}</sws:IntegrationID>"
        f"<sws:Username>{_stamps_xml(credentials['username'])}</sws:Username>"
        f"<sws:Password>{_stamps_xml(credentials['password'])}</sws:Password>"
        "</sws:Credentials>"
    )
    request_xml = (
        '<?xml version="1.0" encoding="utf-8"?>'
        f'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sws="{_stamps_xml(STAMPS_V160_NAMESPACE)}">'
        f"<soapenv:Header/><soapenv:Body><sws:GetAccountInfo>{credentials_xml}</sws:GetAccountInfo></soapenv:Body></soapenv:Envelope>"
    ).encode("utf-8")
    request = urllib.request.Request(
        STAMPS_PRODUCTION_ENDPOINT,
        data=request_xml,
        method="POST",
        headers={
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": f'"{STAMPS_V160_NAMESPACE}/GetAccountInfo"',
            "User-Agent": "TheOutHaven/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=STAMPS_REQUEST_TIMEOUT_SECONDS) as upstream:
            status = int(upstream.status)
            body = upstream.read(MAX_STAMPS_XML_BYTES + 1)
    except urllib.error.HTTPError as exc:
        status = int(exc.code)
        body = exc.read(MAX_STAMPS_XML_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("stamps_getaccountinfo_unavailable") from exc
    if len(body) > MAX_STAMPS_XML_BYTES:
        raise RuntimeError("stamps_response_too_large")
    response_xml = body.decode("utf-8", errors="replace")
    if status < 200 or status >= 300 or ":Fault" in response_xml or "<Fault" in response_xml:
        raise RuntimeError("stamps_getaccountinfo_failed")
    return response_xml


def stamps_status():
    credentials = _load_stamps_credentials(missing_ok=True)
    configured = _stamps_credentials_configured(credentials)
    return {
        "ok": True,
        "provider": "stamps",
        "mode": "live",
        "apiVersion": "v160",
        "configured": configured,
        "postcardEnabled": configured,
        "livePurchasesEnabled": False,
        "endpointApproved": True,
        "credentialSource": "admin-credential-vault",
        "transactionalOperationsEnabled": False,
    }


def stamps_connection_test():
    credentials = _load_stamps_credentials()
    response_xml = _stamps_get_account_info(credentials)
    available_raw = _stamps_read_xml_tag(response_xml, "AvailablePostage")
    try:
        available = float(available_raw) if available_raw is not None else None
    except ValueError:
        available = None
    return {
        "ok": True,
        "provider": "stamps",
        "mode": "live",
        "apiVersion": "v160",
        "accountStatus": _stamps_read_xml_tag(response_xml, "AccountStatus"),
        "customerId": _stamps_read_xml_tag(response_xml, "CustomerID"),
        "meterNumber": _stamps_read_xml_tag(response_xml, "MeterNumber"),
        "availablePostage": available,
        "namespace": STAMPS_V160_NAMESPACE,
        "credentialSource": "admin-credential-vault",
        "message": "Connected to Stamps.com SWS/IM v160 production through the AWS Integration API using the Superadmin Credentials Vault.",
    }


_STAMPS_ORIGIN = {
    "fullName": "TheOutHaven LLC",
    "company": "TheOutHaven LLC",
    "address1": "555 Broadhollow Rd",
    "address2": "Suite 305",
    "city": "Melville",
    "state": "NY",
    "zip": "11747",
}
_STAMPS_POSTCARD = {"length": 6, "width": 4, "height": 0.01, "weightLb": 0, "weightOz": 1}
_STAMPS_LABEL_TIMEOUT_SECONDS = 10
_MAX_STAMPS_LABEL_BYTES = 3_000_000
_cached_stamps_wsdl = None
_cached_stamps_indicium_item_element = None


def _stamps_enabled(value, default=False):
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    return _stamps_clean(value).lower() in {"1", "true", "yes", "on", "enabled"}


def _load_stamps_runtime_config(*, missing_ok=False):
    # Never cache transactional configuration. A live-purchase kill switch in
    # Secrets Manager must become authoritative on the very next invocation.
    try:
        raw = _stamps_clean(secrets.get_secret_value(SecretId=STAMPS_CREDENTIAL_SECRET_ID).get("SecretString", ""))
    except ClientError as exc:
        if missing_ok and exc.response.get("Error", {}).get("Code") == "ResourceNotFoundException":
            raw = ""
        else:
            raise
    if not raw:
        payload = {}
    else:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError("stamps_credential_secret_invalid_json") from exc
        if not isinstance(payload, dict):
            raise RuntimeError("stamps_credential_secret_invalid")
    integration_id = _stamps_clean(payload.get("integrationId"))
    username = _stamps_clean(payload.get("username"))
    password = _stamps_clean(payload.get("password"))
    configured = bool(integration_id and username and password)
    postcard_enabled = configured and _stamps_enabled(payload.get("postcardEnabled"), default=True)
    live_enabled = postcard_enabled and _stamps_enabled(payload.get("livePurchasesEnabled"), default=False)
    return {
        "integrationId": integration_id,
        "username": username,
        "password": password,
        "configured": configured,
        "postcardEnabled": postcard_enabled,
        "livePurchasesEnabled": live_enabled,
    }


def _stamps_load_wsdl():
    global _cached_stamps_wsdl
    if _cached_stamps_wsdl is not None:
        return _cached_stamps_wsdl
    request = urllib.request.Request(
        STAMPS_PRODUCTION_WSDL,
        method="GET",
        headers={"Accept": "text/xml,application/xml", "User-Agent": "TheOutHaven-IntegrationAPI/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=STAMPS_REQUEST_TIMEOUT_SECONDS) as upstream:
            body = upstream.read(MAX_STAMPS_XML_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("stamps_wsdl_unavailable") from exc
    if len(body) > MAX_STAMPS_XML_BYTES:
        raise RuntimeError("stamps_wsdl_too_large")
    wsdl = body.decode("utf-8", errors="replace")
    match = re.search(r"targetNamespace=[\"']([^\"']+)[\"']", wsdl, flags=re.IGNORECASE)
    if not match or match.group(1) != STAMPS_V160_NAMESPACE:
        raise RuntimeError("stamps_wsdl_namespace_mismatch")
    _cached_stamps_wsdl = wsdl
    return wsdl


def _stamps_indicium_item_element():
    global _cached_stamps_indicium_item_element
    if _cached_stamps_indicium_item_element:
        return _cached_stamps_indicium_item_element
    candidates = [
        (match.group(1), int(match.group(2)))
        for match in re.finditer(r"name=[\"'](IndiciumInfoV(\d+))[\"']", _stamps_load_wsdl(), flags=re.IGNORECASE)
    ]
    if not candidates:
        raise RuntimeError("stamps_indicium_type_missing")
    candidates.sort(key=lambda item: item[1], reverse=True)
    _cached_stamps_indicium_item_element = candidates[0][0]
    return _cached_stamps_indicium_item_element


def _stamps_soap_call(operation, body):
    _stamps_load_wsdl()
    request_xml = (
        '<?xml version="1.0" encoding="utf-8"?>'
        f'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sws="{_stamps_xml(STAMPS_V160_NAMESPACE)}">'
        f"<soapenv:Header/><soapenv:Body><sws:{operation}>{body}</sws:{operation}></soapenv:Body></soapenv:Envelope>"
    ).encode("utf-8")
    request = urllib.request.Request(
        STAMPS_PRODUCTION_ENDPOINT,
        data=request_xml,
        method="POST",
        headers={
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": f'"{STAMPS_V160_NAMESPACE}/{operation}"',
            "User-Agent": "TheOutHaven-IntegrationAPI/1.0",
        },
    )
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=STAMPS_REQUEST_TIMEOUT_SECONDS) as upstream:
            status_code = int(upstream.status)
            response_bytes = upstream.read(MAX_STAMPS_XML_BYTES + 1)
    except urllib.error.HTTPError as exc:
        status_code = int(exc.code)
        response_bytes = exc.read(MAX_STAMPS_XML_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"stamps_{operation.lower()}_unavailable") from exc
    if len(response_bytes) > MAX_STAMPS_XML_BYTES:
        raise RuntimeError("stamps_response_too_large")
    response_xml = response_bytes.decode("utf-8", errors="replace")
    print(json.dumps({
        "level": "info",
        "service": "integration-api",
        "provider": "stamps",
        "operation": operation,
        "durationMs": int((time.time() - started) * 1000),
        "status": status_code,
        "apiVersion": "v160",
    }))
    if status_code < 200 or status_code >= 300 or ":Fault" in response_xml or "<Fault" in response_xml:
        raise RuntimeError(f"stamps_{operation.lower()}_failed")
    return response_xml


def _stamps_credentials_xml(config):
    return (
        "<sws:Credentials>"
        f"<sws:IntegrationID>{_stamps_xml(config['integrationId'])}</sws:IntegrationID>"
        f"<sws:Username>{_stamps_xml(config['username'])}</sws:Username>"
        f"<sws:Password>{_stamps_xml(config['password'])}</sws:Password>"
        "</sws:Credentials>"
    )


def _stamps_address_xml(address):
    return (
        f"<sws:FullName>{_stamps_xml(address['name'])}</sws:FullName>"
        f"<sws:Company>{_stamps_xml(address['name'])}</sws:Company>"
        f"<sws:Address1>{_stamps_xml(address['street'])}</sws:Address1>"
        f"<sws:City>{_stamps_xml(address['city'])}</sws:City>"
        f"<sws:State>{_stamps_xml(address['state'])}</sws:State>"
        f"<sws:ZIPCode>{_stamps_xml(address['zip'])}</sws:ZIPCode>"
    )


def _stamps_cleansed_address_xml(address, include_hash):
    cleanse_hash = f"<sws:CleanseHash>{_stamps_xml(address['cleanseHash'])}</sws:CleanseHash>" if include_hash else ""
    return (
        f"<sws:FullName>{_stamps_xml(address['name'])}</sws:FullName>"
        f"<sws:Company>{_stamps_xml(address['name'])}</sws:Company>"
        f"<sws:Address1>{_stamps_xml(address['street'])}</sws:Address1>"
        f"<sws:Address2>{_stamps_xml(address['address2'])}</sws:Address2>"
        f"<sws:City>{_stamps_xml(address['city'])}</sws:City>"
        f"<sws:State>{_stamps_xml(address['state'])}</sws:State>"
        f"<sws:ZIPCode>{_stamps_xml(address['zip'])}</sws:ZIPCode>"
        f"<sws:ZIPCodeAddOn>{_stamps_xml(address['zip4'])}</sws:ZIPCodeAddOn>"
        f"<sws:DPB>{_stamps_xml(address['dpb'])}</sws:DPB>"
        f"<sws:CheckDigit>{_stamps_xml(address['checkDigit'])}</sws:CheckDigit>"
        f"<sws:Urbanization>{_stamps_xml(address['urbanization'])}</sws:Urbanization>"
        f"{cleanse_hash}"
    )


def _stamps_origin_xml():
    return (
        f"<sws:FullName>{_stamps_xml(_STAMPS_ORIGIN['fullName'])}</sws:FullName>"
        f"<sws:Company>{_stamps_xml(_STAMPS_ORIGIN['company'])}</sws:Company>"
        f"<sws:Address1>{_stamps_xml(_STAMPS_ORIGIN['address1'])}</sws:Address1>"
        f"<sws:Address2>{_stamps_xml(_STAMPS_ORIGIN['address2'])}</sws:Address2>"
        f"<sws:City>{_stamps_xml(_STAMPS_ORIGIN['city'])}</sws:City>"
        f"<sws:State>{_stamps_xml(_STAMPS_ORIGIN['state'])}</sws:State>"
        f"<sws:ZIPCode>{_stamps_xml(_STAMPS_ORIGIN['zip'])}</sws:ZIPCode>"
    )


def _stamps_read_boolean(xml_text, tag):
    return _stamps_clean(_stamps_read_xml_tag(xml_text, tag)).lower() == "true"


def _stamps_find_postcard_rate(response_xml):
    blocks = re.findall(
        r"<(?:[A-Za-z0-9_-]+:)?Rate(?:\s[^>]*)?>[\s\S]*?</(?:[A-Za-z0-9_-]+:)?Rate>",
        response_xml,
        flags=re.IGNORECASE,
    )
    selected = next((block for block in blocks if _stamps_read_xml_tag(block, "PackageType") == "Postcard" and _stamps_read_xml_tag(block, "ServiceType") == "US-FC"), None)
    if selected is None:
        selected = next((block for block in blocks if _stamps_read_xml_tag(block, "PackageType") == "Postcard"), None)
    if selected is None:
        raise RuntimeError("stamps_postcard_rate_missing")
    try:
        amount = float(_stamps_read_xml_tag(selected, "Amount") or "")
    except ValueError as exc:
        raise RuntimeError("stamps_postcard_rate_invalid") from exc
    if amount <= 0:
        raise RuntimeError("stamps_postcard_rate_invalid")
    return {
        "amount": amount,
        "serviceType": _stamps_read_xml_tag(selected, "ServiceType") or "US-FC",
        "packageType": _stamps_read_xml_tag(selected, "PackageType") or "Postcard",
        "shipDate": _stamps_read_xml_tag(selected, "ShipDate") or time.strftime("%Y-%m-%d", time.gmtime()),
    }


def _stamps_mailing_rate_xml(rate, address):
    return (
        "<sws:Rate>"
        f"<sws:From>{_stamps_origin_xml()}</sws:From>"
        f"<sws:To>{_stamps_cleansed_address_xml(address, True)}</sws:To>"
        f"<sws:Amount>{rate['amount']:.4f}</sws:Amount>"
        f"<sws:ServiceType>{_stamps_xml(rate['serviceType'])}</sws:ServiceType>"
        "<sws:PrintLayout>Default</sws:PrintLayout>"
        f"<sws:WeightLb>{_STAMPS_POSTCARD['weightLb']}</sws:WeightLb>"
        f"<sws:WeightOz>{_STAMPS_POSTCARD['weightOz']}</sws:WeightOz>"
        f"<sws:PackageType>{_stamps_xml(rate['packageType'])}</sws:PackageType>"
        f"<sws:Length>{_STAMPS_POSTCARD['length']}</sws:Length>"
        f"<sws:Width>{_STAMPS_POSTCARD['width']}</sws:Width>"
        f"<sws:Height>{_STAMPS_POSTCARD['height']}</sws:Height>"
        f"<sws:ShipDate>{_stamps_xml(rate['shipDate'])}</sws:ShipDate>"
        "<sws:NonMachinable>false</sws:NonMachinable>"
        "<sws:RectangularShaped>true</sws:RectangularShaped>"
        "</sws:Rate>"
    )


class _StampsNoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _stamps_download_label_png(label_url):
    try:
        parsed = urllib.parse.urlparse(_stamps_clean(label_url))
    except Exception as exc:
        raise RuntimeError("stamps_label_url_invalid") from exc
    if parsed.scheme != "https" or parsed.hostname != "swsim.stamps.com" or not parsed.path.startswith("/Label/"):
        raise RuntimeError("stamps_label_url_unapproved")
    request = urllib.request.Request(label_url, method="GET", headers={"Accept": "image/png", "User-Agent": "TheOutHaven-IntegrationAPI/1.0"})
    opener = urllib.request.build_opener(_StampsNoRedirect())
    try:
        with opener.open(request, timeout=_STAMPS_LABEL_TIMEOUT_SECONDS) as upstream:
            payload = upstream.read(_MAX_STAMPS_LABEL_BYTES + 1)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("stamps_label_download_failed") from exc
    if len(payload) > _MAX_STAMPS_LABEL_BYTES:
        raise RuntimeError("stamps_label_too_large")
    if len(payload) < 8 or payload[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("stamps_label_not_png")
    return base64.b64encode(payload).decode("ascii")


def stamps_status():
    config = _load_stamps_runtime_config(missing_ok=True)
    return {
        "ok": True,
        "provider": "stamps",
        "mode": "live",
        "apiVersion": "v160",
        "configured": config["configured"],
        "postcardEnabled": config["postcardEnabled"],
        "livePurchasesEnabled": config["livePurchasesEnabled"],
        "endpointApproved": True,
        "credentialSource": "admin-credential-vault",
        "transactionalOperationsEnabled": config["livePurchasesEnabled"],
    }


def stamps_connection_test():
    config = _load_stamps_runtime_config()
    if not config["configured"]:
        raise RuntimeError("stamps_credentials_not_configured")
    response_xml = _stamps_soap_call("GetAccountInfo", _stamps_credentials_xml(config))
    available_raw = _stamps_read_xml_tag(response_xml, "AvailablePostage")
    try:
        available = float(available_raw) if available_raw is not None else None
    except ValueError:
        available = None
    return {
        "ok": True,
        "provider": "stamps",
        "mode": "live",
        "apiVersion": "v160",
        "accountStatus": _stamps_read_xml_tag(response_xml, "AccountStatus"),
        "customerId": _stamps_read_xml_tag(response_xml, "CustomerID"),
        "meterNumber": _stamps_read_xml_tag(response_xml, "MeterNumber"),
        "availablePostage": available,
        "namespace": STAMPS_V160_NAMESPACE,
        "credentialSource": "admin-credential-vault",
        "message": "Connected to Stamps.com SWS/IM v160 production through the AWS Integration API using the Superadmin Credentials Vault.",
    }


def stamps_production_postcard_proof(payload, context=None):
    config = _load_stamps_runtime_config()
    if not config["configured"]:
        raise RuntimeError("stamps_credentials_not_configured")
    if not config["postcardEnabled"]:
        raise RuntimeError("stamps_postcard_disabled")
    if not config["livePurchasesEnabled"]:
        raise RuntimeError("stamps_live_purchases_disabled")

    integrator_tx_id = _stamps_clean(payload.get("integratorTxId"))
    if not re.fullmatch(r"toh-postcard-live-[A-Za-z0-9-]{8,80}", integrator_tx_id) or len(integrator_tx_id) > 100:
        raise ValueError("stamps_integrator_tx_id_invalid")
    raw_address = payload.get("address")
    if not isinstance(raw_address, dict):
        raise ValueError("stamps_address_required")
    address = {
        "name": _stamps_clean(raw_address.get("name")),
        "street": _stamps_clean(raw_address.get("street")),
        "city": _stamps_clean(raw_address.get("city")),
        "state": _stamps_clean(raw_address.get("state")).upper()[:2],
        "zip": re.sub(r"\D", "", _stamps_clean(raw_address.get("zip")))[:5],
    }
    if not all(address.values()) or len(address["state"]) != 2 or len(address["zip"]) != 5:
        raise ValueError("stamps_address_invalid")

    account_xml = _stamps_soap_call("GetAccountInfo", _stamps_credentials_xml(config))
    auth1 = _stamps_read_xml_tag(account_xml, "Authenticator")
    if not auth1:
        raise RuntimeError("stamps_authenticator_missing")

    cleanse_xml = _stamps_soap_call(
        "CleanseAddress",
        f"<sws:Authenticator>{_stamps_xml(auth1)}</sws:Authenticator>"
        f"<sws:Address>{_stamps_address_xml(address)}</sws:Address>"
        f"<sws:FromZIPCode>{_STAMPS_ORIGIN['zip']}</sws:FromZIPCode>",
    )
    auth2 = _stamps_read_xml_tag(cleanse_xml, "Authenticator")
    if not auth2:
        raise RuntimeError("stamps_cleanse_authenticator_missing")
    address_match = _stamps_read_boolean(cleanse_xml, "AddressMatch")
    city_state_zip_ok = _stamps_read_boolean(cleanse_xml, "CityStateZipOK")
    cleanse_hash = _stamps_read_xml_tag(cleanse_xml, "CleanseHash") or ""
    if not address_match or not city_state_zip_ok or not cleanse_hash:
        raise RuntimeError("stamps_address_not_deliverable")

    cleansed = {
        "name": _stamps_read_xml_tag(cleanse_xml, "Company") or _stamps_read_xml_tag(cleanse_xml, "FullName") or address["name"],
        "street": _stamps_read_xml_tag(cleanse_xml, "Address1") or address["street"],
        "address2": _stamps_read_xml_tag(cleanse_xml, "Address2") or "",
        "city": _stamps_read_xml_tag(cleanse_xml, "City") or address["city"],
        "state": _stamps_read_xml_tag(cleanse_xml, "State") or address["state"],
        "zip": _stamps_read_xml_tag(cleanse_xml, "ZIPCode") or address["zip"],
        "zip4": _stamps_read_xml_tag(cleanse_xml, "ZIPCodeAddOn") or "",
        "dpb": _stamps_read_xml_tag(cleanse_xml, "DPB") or "",
        "checkDigit": _stamps_read_xml_tag(cleanse_xml, "CheckDigit") or "",
        "urbanization": _stamps_read_xml_tag(cleanse_xml, "Urbanization") or "",
        "cleanseHash": cleanse_hash,
    }

    ship_date = time.strftime("%Y-%m-%d", time.gmtime())
    rates_xml = _stamps_soap_call(
        "GetRates",
        f"<sws:Authenticator>{_stamps_xml(auth2)}</sws:Authenticator>"
        "<sws:Rate>"
        f"<sws:From>{_stamps_origin_xml()}</sws:From>"
        f"<sws:To>{_stamps_cleansed_address_xml(cleansed, False)}</sws:To>"
        f"<sws:WeightLb>{_STAMPS_POSTCARD['weightLb']}</sws:WeightLb>"
        f"<sws:WeightOz>{_STAMPS_POSTCARD['weightOz']}</sws:WeightOz>"
        "<sws:PackageType>Postcard</sws:PackageType>"
        f"<sws:Length>{_STAMPS_POSTCARD['length']}</sws:Length>"
        f"<sws:Width>{_STAMPS_POSTCARD['width']}</sws:Width>"
        f"<sws:Height>{_STAMPS_POSTCARD['height']}</sws:Height>"
        f"<sws:ShipDate>{ship_date}</sws:ShipDate>"
        "<sws:NonMachinable>false</sws:NonMachinable>"
        "<sws:RectangularShaped>true</sws:RectangularShaped>"
        "</sws:Rate><sws:Carrier>USPS</sws:Carrier>",
    )
    auth3 = _stamps_read_xml_tag(rates_xml, "Authenticator")
    if not auth3:
        raise RuntimeError("stamps_rates_authenticator_missing")
    rate = _stamps_find_postcard_rate(rates_xml)
    item_element = _stamps_indicium_item_element()

    # Transaction-sensitive call: exactly one attempt. There is deliberately no
    # retry wrapper here; Vercel has already reserved IntegratorTxId in Supabase.
    indicium_xml = _stamps_soap_call(
        "CreateMailingLabelIndicia",
        f"<sws:Authenticator>{_stamps_xml(auth3)}</sws:Authenticator>"
        f"<sws:IntegratorTxId>{_stamps_xml(integrator_tx_id)}</sws:IntegratorTxId>"
        "<sws:Layout>SDC3110</sws:Layout>"
        "<sws:PrintToAddress>false</sws:PrintToAddress>"
        "<sws:StartRow>0</sws:StartRow><sws:StartColumn>0</sws:StartColumn>"
        f"<sws:IndiciumInfo><sws:{item_element}>{_stamps_mailing_rate_xml(rate, cleansed)}</sws:{item_element}></sws:IndiciumInfo>"
        "<sws:Mode>Normal</sws:Mode><sws:ImageType>Png</sws:ImageType>"
        "<sws:BypassCleanseAddress>false</sws:BypassCleanseAddress>"
        "<sws:ReturnIndiciumData>false</sws:ReturnIndiciumData>"
        "<sws:ImageId>0</sws:ImageId><sws:PrintFromAddress>false</sws:PrintFromAddress>",
    )

    stamps_tx_id = _stamps_read_xml_tag(indicium_xml, "StampsTxID") or _stamps_read_xml_tag(indicium_xml, "StampsTxId")
    label_url = _stamps_read_xml_tag(indicium_xml, "Url")
    label_png_base64 = None
    label_warning = None
    if label_url:
        remaining_ms = None
        if context is not None and hasattr(context, "get_remaining_time_in_millis"):
            try:
                remaining_ms = int(context.get_remaining_time_in_millis())
            except Exception:
                remaining_ms = None
        if remaining_ms is not None and remaining_ms < 15_000:
            # The USPS indicium is already purchased. Return the known transaction
            # immediately instead of risking a Lambda timeout during optional image IO.
            label_warning = "stamps_label_download_deferred"
        else:
            try:
                label_png_base64 = _stamps_download_label_png(label_url)
            except Exception as exc:
                warning = _stamps_clean(exc)
                label_warning = warning if re.fullmatch(r"stamps_[a-z0-9_]+", warning) else "stamps_label_unavailable"
    else:
        label_warning = "stamps_label_url_missing"

    return {
        "ok": True,
        "provider": "stamps",
        "mode": "live",
        "apiVersion": "v160",
        "businessName": address["name"],
        "cleansedAddress": {
            "street": cleansed["street"],
            "city": cleansed["city"],
            "state": cleansed["state"],
            "zip": cleansed["zip"],
            "zip4": cleansed["zip4"] or None,
        },
        "addressMatch": address_match,
        "cityStateZipOk": city_state_zip_ok,
        "amount": rate["amount"],
        "serviceType": rate["serviceType"],
        "packageType": rate["packageType"],
        "shipDate": rate["shipDate"],
        "stampsTxId": stamps_tx_id,
        "integratorTxId": integrator_tx_id,
        "labelPngBase64": label_png_base64,
        "labelWarning": label_warning,
        "sampleOnly": False,
    }

def handler(event, context):
    body = raw_body(event)
    try:
        if not authenticate(event, body):
            return response(401, {"ok": False, "error": "unauthorized"})
    except Exception:
        return response(503, {"ok": False, "error": "integration_api_auth_unavailable"})

    method = request_method(event)
    path = request_path(event)
    if method == "GET" and path == "/v1/status":
        return response(200, {"ok": True, "service": "theouthaven-integration-api", "environment": ENVIRONMENT, "providers": ["microsoft-graph", "stripe-connect", "google-places", "telnyx", "resend", "stamps"]})
    if method == "GET" and path == "/v1/stripe/status":
        try:
            return response(200, stripe_status())
        except Exception:
            return response(502, {"ok": False, "error": "stripe_unavailable"})
    if method == "GET" and path == "/v1/google-places/status":
        try:
            return response(200, google_places_status())
        except Exception:
            return response(502, {"ok": False, "error": "google_places_unavailable"})
    if method == "GET" and path == "/v1/telnyx/status":
        try:
            return response(200, telnyx_status())
        except Exception:
            return response(502, {"ok": False, "error": "telnyx_unavailable"})
    if method == "GET" and path == "/v1/telnyx/verify":
        try:
            return response(200, telnyx_verify_channels())
        except Exception:
            return response(502, {"ok": False, "error": "telnyx_verification_failed"})
    if method == "GET" and path == "/v1/stamps/status":
        try:
            return response(200, stamps_status())
        except Exception:
            return response(502, {"ok": False, "error": "stamps_unavailable"})
    if method == "POST" and path == "/v1/stamps/connection-test":
        try:
            return response(200, stamps_connection_test())
        except Exception as exc:
            message = str(exc).strip()
            safe_error = message if re.fullmatch(r"stamps_[a-z0-9_]+", message) else "stamps_unavailable"
            return response(502, {"ok": False, "error": safe_error})
    if method == "POST" and path == "/v1/stamps/postcard/production-proof":
        try:
            return response(200, stamps_production_postcard_proof(parse_json(body), context=context))
        except ValueError as exc:
            message = str(exc).strip()
            safe_error = message if re.fullmatch(r"stamps_[a-z0-9_]+", message) else "stamps_invalid_request"
            return response(400, {"ok": False, "error": safe_error})
        except Exception as exc:
            message = str(exc).strip()
            safe_error = message if re.fullmatch(r"stamps_[a-z0-9_]+", message) else "stamps_unavailable"
            return response(502, {"ok": False, "error": safe_error})
    if method == "GET" and path == "/v1/microsoft-app/readiness":
        try:
            return response(200, microsoft_app_readiness())
        except Exception as exc:
            return response(502, {"ok": False, "error": str(exc)[:300] or "microsoft_readiness_failed"})
    if method == "POST" and path == "/v1/stripe-connect/payouts/read":
        try:
            return response(200, stripe_connect_snapshot(parse_json(body)))
        except ValueError as exc:
            return response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return response(500, {"ok": False, "error": "stripe_connect_payouts_read_failed"})
    if method == "POST" and path == "/v1/stripe/request":
        try:
            return response(200, stripe_request_proxy(parse_json(body)))
        except ValueError as exc:
            return response(400, {"ok": False, "error": str(exc)})
        except Exception as exc:
            return response(502, {"ok": False, "error": str(exc)[:300] or "stripe_request_failed"})
    if method == "POST" and path == "/v1/resend/emails/send":
        try:
            return response(200, resend_send(parse_json(body)))
        except ValueError as exc:
            return response(400, {"ok": False, "error": str(exc)})
        except Exception as exc:
            return response(502, {"ok": False, "error": str(exc)[:300] or "resend_send_failed"})
    if method == "POST" and path == "/v1/microsoft-oauth/token":
        try:
            return response(200, microsoft_token_request(parse_json(body)))
        except ValueError as exc:
            return response(400, {"ok": False, "error": str(exc)})
        except Exception as exc:
            return response(502, {"ok": False, "error": str(exc)[:500] or "microsoft_token_failed"})
    if method == "POST" and path == "/v1/microsoft-app/graph":
        try:
            return microsoft_app_graph(parse_json(body))
        except ValueError as exc:
            return response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return response(502, {"ok": False, "error": "microsoft_app_graph_unavailable"})
    if method == "POST" and path == "/v1/google-places/search-text":
        return google_json_route(google_places_search_text, body)
    if method == "POST" and path == "/v1/google-places/details":
        return google_json_route(google_places_details, body)
    if method == "POST" and path == "/v1/google-places/photo-metadata":
        return google_json_route(google_places_photo_metadata, body)
    if method == "POST" and path == "/v1/google-places/photo-media":
        try:
            media = google_places_photo_media(parse_json(body))
            return response(media["status"], content_type=media["contentType"], raw_body=base64.b64encode(media["bodyBytes"]).decode("ascii"), extra_headers={"x-toh-upstream": "google-places"}, is_base64_encoded=True)
        except ValueError as exc:
            return response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return response(502, {"ok": False, "error": "google_places_photo_unavailable"})
    if method == "POST" and path == "/v1/telnyx/messages/send":
        return telnyx_json_route(telnyx_send_message, body)
    if method == "POST" and path == "/v1/microsoft-graph":
        try:
            return graph_request(parse_json(body))
        except ValueError as exc:
            return response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return response(500, {"ok": False, "error": "integration_api_internal_error"})
    return response(404, {"ok": False, "error": "not_found"})