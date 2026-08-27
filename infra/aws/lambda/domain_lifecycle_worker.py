import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_SECRET_ARN = os.environ["SUPABASE_SERVICE_ROLE_SECRET_ARN"]
DOMAIN_GATEWAY_URL = os.environ["DOMAIN_GATEWAY_URL"].rstrip("/")
DOMAIN_GATEWAY_SECRET_ARN = os.environ["DOMAIN_GATEWAY_SECRET_ARN"]
REGISTRATION_RECONCILE_BATCH = int(os.environ.get("REGISTRATION_RECONCILE_BATCH", "10"))
RENEWAL_BATCH = int(os.environ.get("RENEWAL_BATCH", "10"))
REGISTRATION_RECONCILE_AFTER_SECONDS = 120
RENEWAL_WINDOW_DAYS = 30
HTTP_TIMEOUT_SECONDS = 12

secrets = boto3.client("secretsmanager")
_secret_cache = {}


def _secret(arn):
    if arn in _secret_cache:
        return _secret_cache[arn]
    response = secrets.get_secret_value(SecretId=arn)
    value = response.get("SecretString")
    if not value:
        raise RuntimeError("required_secret_missing")
    _secret_cache[arn] = value
    return value


def _request(method, url, headers=None, payload=None, timeout=HTTP_TIMEOUT_SECONDS):
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
    request_headers = {"accept": "application/json", **(headers or {})}
    if body is not None:
        request_headers["content-type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            data = {"message": raw[:500]}
        raise RuntimeError(f"http_{error.code}:{data}") from error


def _supabase(method, table_path, params=None, payload=None, prefer=None):
    service_key = _secret(SUPABASE_SERVICE_ROLE_SECRET_ARN)
    query = f"?{urllib.parse.urlencode(params, doseq=True)}" if params else ""
    headers = {
        "apikey": service_key,
        "authorization": f"Bearer {service_key}",
    }
    if prefer:
        headers["prefer"] = prefer
    _, data = _request(method, f"{SUPABASE_URL}/rest/v1/{table_path}{query}", headers=headers, payload=payload)
    return data


def _gateway(method, path, payload=None, idempotency_key=None):
    body = "" if payload is None else json.dumps(payload, separators=(",", ":"))
    timestamp = str(int(time.time() * 1000))
    signed = "\n".join([timestamp, method.upper(), path, body])
    secret = _secret(DOMAIN_GATEWAY_SECRET_ARN)
    signature = hmac.new(secret.encode(), signed.encode(), hashlib.sha256).hexdigest()
    headers = {
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
    }
    if idempotency_key:
        headers["x-idempotency-key"] = idempotency_key
    request = urllib.request.Request(
        f"{DOMAIN_GATEWAY_URL}{path}",
        data=body.encode("utf-8") if body else None,
        headers={"content-type": "application/json", "accept": "application/json", **headers},
        method=method.upper(),
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"domain_gateway_http_{error.code}:{raw[:500]}") from error


def _clean_domain(value):
    text = str(value or "").strip().lower()
    for prefix in ("https://", "http://"):
        if text.startswith(prefix):
            text = text[len(prefix):]
    return text.rstrip("/")


def _iso(value):
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _update_location(location_id, patch):
    payload = {**patch, "updated_at": datetime.now(timezone.utc).isoformat()}
    _supabase("PATCH", "locations", {"id": f"eq.{location_id}"}, payload, "return=minimal")


def _reconcile_registrations():
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=REGISTRATION_RECONCILE_AFTER_SECONDS)
    rows = _supabase("GET", "domain_registration_operations", {
        "select": "id,location_id,domain_name,updated_at",
        "status": "eq.registering",
        "updated_at": f"lt.{cutoff.isoformat()}",
        "order": "updated_at.asc",
        "limit": str(REGISTRATION_RECONCILE_BATCH),
    }) or []
    reconciled = 0
    waiting = 0
    errors = 0
    for operation in rows:
        domain = _clean_domain(operation.get("domain_name"))
        try:
            registrar = _gateway("POST", "/v1/domains/status", {"domain": domain})
            if not registrar.get("active") or str(registrar.get("sponsoringRsp")) != "1":
                waiting += 1
                continue
            _supabase("POST", "rpc/complete_partner_pro_included_domain", payload={
                "p_operation_id": operation["id"],
                "p_gateway_order_id": None,
                "p_gateway_response_code": registrar.get("responseCode") or "200",
                "p_gateway_expiration_date": registrar.get("expirationDate"),
            })
            _update_location(operation["location_id"], {
                "included_domain_connection_status": "pending",
                "included_domain_verification_checked_at": None,
            })
            reconciled += 1
        except Exception:
            errors += 1
            _supabase("PATCH", "domain_registration_operations", {
                "id": f"eq.{operation['id']}",
                "status": "eq.registering",
            }, {
                "error_code": "registration_reconciliation_retry",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }, "return=minimal")
    return {"examined": len(rows), "reconciled": reconciled, "waiting": waiting, "errors": errors}


def _renewal_enabled():
    settings = _supabase("GET", "app_settings", {
        "select": "value",
        "key": "eq.partner_pro_domain_benefit",
        "limit": "1",
    }) or []
    value = settings[0].get("value") if settings and isinstance(settings[0].get("value"), dict) else {}
    return value.get("renewalIncluded") is True


def _process_renewals():
    if not _renewal_enabled():
        return {"policyEnabled": False, "gatewayEnabled": False, "examined": 0, "renewed": 0, "errors": 0}
    gateway_status = _gateway("GET", "/v1/status")
    if gateway_status.get("renewalEnabled") is not True:
        return {"policyEnabled": True, "gatewayEnabled": False, "examined": 0, "renewed": 0, "errors": 0}

    threshold = datetime.now(timezone.utc) + timedelta(days=RENEWAL_WINDOW_DAYS)
    rows = _supabase("GET", "locations", {
        "select": "id,included_domain_name,included_domain_renewal_due_at",
        "included_domain_status": "eq.active",
        "included_domain_name": "not.is.null",
        "included_domain_renewal_due_at": ["not.is.null", f"lte.{threshold.isoformat()}"],
        "order": "included_domain_renewal_due_at.asc",
        "limit": str(RENEWAL_BATCH),
    }) or []

    renewed = 0
    not_due = 0
    missing_expiration = 0
    errors = 0
    for location in rows:
        domain = _clean_domain(location.get("included_domain_name"))
        try:
            registrar = _gateway("POST", "/v1/domains/status", {"domain": domain})
            expiration = _iso(registrar.get("expirationDate"))
            if not expiration:
                missing_expiration += 1
                continue
            if expiration > threshold:
                _update_location(location["id"], {"included_domain_renewal_due_at": expiration.isoformat()})
                not_due += 1
                continue
            expiration_year = expiration.year
            raw_key = f"{location['id']}:{domain}:{expiration_year}"
            idempotency_key = f"toh-renew-{hashlib.sha256(raw_key.encode()).hexdigest()[:40]}"
            renewal = _gateway("POST", "/v1/domains/renew", {
                "domain": domain,
                "period": 1,
                "currentExpirationYear": expiration_year,
                "autoRenew": False,
            }, idempotency_key=idempotency_key)
            if renewal.get("expirationDate"):
                _update_location(location["id"], {
                    "included_domain_renewal_due_at": renewal["expirationDate"],
                    "included_domain_status": "active",
                })
            renewed += 1
        except Exception:
            errors += 1
    return {
        "policyEnabled": True,
        "gatewayEnabled": True,
        "examined": len(rows),
        "renewed": renewed,
        "notDue": not_due,
        "missingExpiration": missing_expiration,
        "errors": errors,
    }


def _run_tick():
    reconciliation = _reconcile_registrations()
    renewals = _process_renewals()
    result = {"registrationReconciliation": reconciliation, "renewals": renewals}
    total_errors = reconciliation["errors"] + renewals["errors"]
    print(json.dumps({"event": "domain_lifecycle_tick", **result}))
    if total_errors:
        raise RuntimeError(f"domain_lifecycle_partial_failure:{total_errors}")
    return result


def handler(event, context):
    failures = []
    for record in event.get("Records") or []:
        message_id = str(record.get("messageId") or "")
        try:
            envelope = json.loads(record.get("body") or "{}")
            if envelope.get("jobType") != "domain.lifecycle.tick":
                raise ValueError("unsupported_domain_lifecycle_job")
            _run_tick()
        except Exception as error:
            print(json.dumps({
                "event": "domain_lifecycle_worker_error",
                "messageId": message_id,
                "error": type(error).__name__,
                "requestId": getattr(context, "aws_request_id", None),
            }))
            failures.append({"itemIdentifier": message_id})
    return {"batchItemFailures": failures}
