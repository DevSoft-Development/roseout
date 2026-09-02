import base64
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError, as_completed
import hashlib
import hmac
import json
import os
import re
import time
import urllib.error
import urllib.request

import boto3

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
SHARED_SECRET_ARN = os.environ.get("SHARED_SECRET_ARN", "")
STRIPE_SECRET_ARN = os.environ.get("STRIPE_SECRET_ARN", "")
MAX_CLOCK_SKEW_SECONDS = 300
MAX_REQUEST_BODY_BYTES = 2_000_000
MAX_UPSTREAM_BODY_BYTES = 1_500_000
UPSTREAM_TIMEOUT_SECONDS = 12
STRIPE_REQUEST_TIMEOUT_SECONDS = 4
STRIPE_SNAPSHOT_TIMEOUT_SECONDS = 14
STRIPE_MAX_WORKERS = 10
MAX_STRIPE_ACCOUNTS = 200
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

secrets = boto3.client("secretsmanager")
_cached_secret = None
_cached_stripe_secret = None


def response(status, payload=None, *, content_type="application/json", raw_body=None, extra_headers=None):
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
    return {"statusCode": int(status), "headers": headers, "body": body}


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


def graph_request(payload):
    access_token = str(payload.get("accessToken") or "").strip()
    version = str(payload.get("version") or "v1.0").strip()
    method = str(payload.get("method") or "GET").upper()
    if version not in ALLOWED_GRAPH_VERSIONS:
        return response(400, {"ok": False, "error": "graph_version_invalid"})
    try:
        path = normalize_graph_path(payload.get("path"), version)
    except ValueError as exc:
        return response(400, {"ok": False, "error": str(exc)})
    if not access_token:
        return response(400, {"ok": False, "error": "access_token_required"})
    if method not in ALLOWED_METHODS:
        return response(400, {"ok": False, "error": "graph_method_invalid"})

    forwarded = {}
    supplied_headers = payload.get("headers") or {}
    if not isinstance(supplied_headers, dict):
        return response(400, {"ok": False, "error": "headers_object_required"})
    for key, value in supplied_headers.items():
        normalized = str(key).lower()
        if normalized in ALLOWED_FORWARD_HEADERS:
            forwarded[normalized] = str(value)

    upstream_body = payload.get("body")
    if upstream_body is not None and not isinstance(upstream_body, str):
        return response(400, {"ok": False, "error": "body_string_required"})
    encoded_body = upstream_body.encode("utf-8") if upstream_body is not None else None
    if encoded_body is not None and len(encoded_body) > MAX_REQUEST_BODY_BYTES:
        return response(413, {"ok": False, "error": "upstream_body_too_large"})

    url = f"https://graph.microsoft.com/{version}{path}"
    headers = {
        "accept": forwarded.pop("accept", "application/json"),
        "authorization": f"Bearer {access_token}",
        **forwarded,
    }
    if encoded_body is not None and "content-type" not in headers:
        headers["content-type"] = "application/json"

    request = urllib.request.Request(url, data=encoded_body, method=method, headers=headers)
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


def stripe_error_message(status, body_bytes):
    try:
        payload = json.loads(body_bytes.decode("utf-8", errors="replace") or "{}")
        error = payload.get("error") if isinstance(payload, dict) else None
        message = error.get("message") if isinstance(error, dict) else None
        if message:
            return str(message)[:300]
    except (json.JSONDecodeError, UnicodeDecodeError):
        pass
    return f"Stripe request failed ({status})"


def stripe_get(path, account_id=None):
    headers = {
        "accept": "application/json",
        "authorization": f"Bearer {load_stripe_secret()}",
    }
    if account_id:
        headers["Stripe-Account"] = account_id
    request = urllib.request.Request(f"https://api.stripe.com/v1{path}", method="GET", headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=STRIPE_REQUEST_TIMEOUT_SECONDS) as upstream:
            body_bytes = upstream.read(MAX_UPSTREAM_BODY_BYTES + 1)
            status = upstream.status
    except urllib.error.HTTPError as exc:
        body_bytes = exc.read(MAX_UPSTREAM_BODY_BYTES + 1)
        raise RuntimeError(stripe_error_message(exc.code, body_bytes)) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("Stripe is temporarily unavailable") from exc
    if status < 200 or status >= 300:
        raise RuntimeError(stripe_error_message(status, body_bytes))
    if len(body_bytes) > MAX_UPSTREAM_BODY_BYTES:
        raise RuntimeError("Stripe response was too large")
    try:
        payload = json.loads(body_bytes.decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise RuntimeError("Stripe returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Stripe returned an invalid response")
    return payload


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
    result = {
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
    return result


def stripe_account_snapshot(account_id):
    try:
        balance = stripe_get("/balance", account_id)
        payouts_payload = stripe_get("/payouts?limit=10", account_id)
        payout_rows = payouts_payload.get("data") if isinstance(payouts_payload.get("data"), list) else []
        payouts = []
        for row in payout_rows:
            normalized = normalize_payout(row)
            if normalized:
                payouts.append(normalized)
        return {
            "accountId": account_id,
            "available": normalize_balance_items(balance.get("available")),
            "pending": normalize_balance_items(balance.get("pending")),
            "payouts": payouts,
            "error": None,
        }
    except Exception as exc:
        return {
            "accountId": account_id,
            "available": [],
            "pending": [],
            "payouts": [],
            "error": str(exc)[:300] or "Unable to read Stripe account",
        }


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
                snapshots[account_id] = {
                    "accountId": account_id,
                    "available": [],
                    "pending": [],
                    "payouts": [],
                    "error": "Unable to read Stripe account",
                }
    except FuturesTimeoutError:
        timed_out = True
    finally:
        for future, account_id in future_to_account.items():
            if account_id not in snapshots:
                future.cancel()
                snapshots[account_id] = {
                    "accountId": account_id,
                    "available": [],
                    "pending": [],
                    "payouts": [],
                    "error": "Stripe snapshot timed out",
                }
        executor.shutdown(wait=False, cancel_futures=True)

    return {
        "ok": True,
        "snapshots": [snapshots[account_id] for account_id in account_ids],
        "partial": timed_out or any(item.get("error") for item in snapshots.values()),
    }


def stripe_status():
    load_stripe_secret()
    return {"ok": True, "provider": "stripe-connect", "credentialConfigured": True}


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
        return response(200, {
            "ok": True,
            "service": "theouthaven-integration-api",
            "environment": ENVIRONMENT,
            "providers": ["microsoft-graph", "stripe-connect"],
        })
    if method == "GET" and path == "/v1/stripe/status":
        try:
            return response(200, stripe_status())
        except Exception:
            return response(502, {"ok": False, "error": "stripe_unavailable"})
    if method == "POST" and path == "/v1/stripe-connect/payouts/read":
        try:
            return response(200, stripe_connect_snapshot(parse_json(body)))
        except ValueError as exc:
            return response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return response(500, {"ok": False, "error": "stripe_connect_payouts_read_failed"})
    if method == "POST" and path == "/v1/microsoft-graph":
        try:
            return graph_request(parse_json(body))
        except ValueError as exc:
            return response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return response(500, {"ok": False, "error": "integration_api_internal_error"})
    return response(404, {"ok": False, "error": "not_found"})
