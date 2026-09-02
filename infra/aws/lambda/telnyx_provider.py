import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

import boto3

TELNYX_SECRET_ARN = os.environ.get("TELNYX_SECRET_ARN", "")
TELNYX_REQUEST_TIMEOUT_SECONDS = 8
MAX_TELNYX_RESPONSE_BYTES = 1_000_000
MAX_SMS_BODY_CHARS = 1600
E164_RE = re.compile(r"^\+[1-9][0-9]{7,14}$")
ALLOWED_PURPOSES = {"transactional", "crm", "reservations", "support", "marketing", "concierge"}

secrets = boto3.client("secretsmanager")
_cached_telnyx_config = None


def _clean(value):
    return str(value or "").strip()


def _normalized_purpose(value):
    purpose = _clean(value).lower()
    if purpose not in ALLOWED_PURPOSES:
        raise ValueError("telnyx_purpose_invalid")
    return "reservations" if purpose == "transactional" else purpose


def _normalize_phone(value):
    phone = _clean(value)
    if not E164_RE.fullmatch(phone):
        raise ValueError("telnyx_phone_invalid")
    return phone


def load_telnyx_config():
    global _cached_telnyx_config
    if _cached_telnyx_config:
        return _cached_telnyx_config
    if not TELNYX_SECRET_ARN:
        raise RuntimeError("telnyx_secret_not_configured")
    raw = secrets.get_secret_value(SecretId=TELNYX_SECRET_ARN).get("SecretString", "")
    try:
        payload = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise RuntimeError("telnyx_secret_invalid_json") from exc
    channels = payload.get("channels") if isinstance(payload, dict) else None
    if not isinstance(channels, dict):
        raise RuntimeError("telnyx_channels_not_configured")

    normalized = {}
    for purpose in ("concierge", "crm", "reservations", "support", "marketing"):
        value = channels.get(purpose)
        if not isinstance(value, dict):
            continue
        api_key = _clean(value.get("apiKey"))
        from_number = _clean(value.get("from"))
        if len(api_key) < 20 or not E164_RE.fullmatch(from_number):
            continue
        normalized[purpose] = {"apiKey": api_key, "from": from_number}

    if not normalized:
        raise RuntimeError("telnyx_channels_not_configured")
    _cached_telnyx_config = normalized
    return normalized


def _channel(purpose_value):
    purpose = _normalized_purpose(purpose_value)
    channel = load_telnyx_config().get(purpose)
    if not channel:
        raise RuntimeError(f"telnyx_{purpose}_not_configured")
    return purpose, channel


def _error_message(status_code, body_bytes):
    try:
        payload = json.loads(body_bytes.decode("utf-8", errors="replace") or "{}")
        if isinstance(payload, dict):
            errors = payload.get("errors")
            if isinstance(errors, list) and errors and isinstance(errors[0], dict):
                detail = errors[0].get("detail") or errors[0].get("title")
                if detail:
                    return str(detail)[:300]
            message = payload.get("message")
            if message:
                return str(message)[:300]
    except json.JSONDecodeError:
        pass
    return f"Telnyx request failed ({status_code})"


def _request_json(path, *, api_key, method="GET", body=None):
    url = f"https://api.telnyx.com/v2{path}"
    encoded = None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "TheOutHaven/1.0",
    }
    if body is not None:
        encoded = json.dumps(body, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=encoded, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=TELNYX_REQUEST_TIMEOUT_SECONDS) as upstream:
            status_code = int(upstream.status)
            body_bytes = upstream.read(MAX_TELNYX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        body_bytes = exc.read(MAX_TELNYX_RESPONSE_BYTES + 1)
        raise RuntimeError(_error_message(exc.code, body_bytes)) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("Telnyx is temporarily unavailable") from exc

    if status_code < 200 or status_code >= 300:
        raise RuntimeError(_error_message(status_code, body_bytes))
    if len(body_bytes) > MAX_TELNYX_RESPONSE_BYTES:
        raise RuntimeError("Telnyx response was too large")
    try:
        payload = json.loads(body_bytes.decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise RuntimeError("Telnyx returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Telnyx returned an invalid response")
    return payload


def status():
    channels = load_telnyx_config()
    return {
        "ok": True,
        "provider": "telnyx",
        "credentialConfigured": True,
        "channels": sorted(channels.keys()),
    }


def verify_channels():
    channels = load_telnyx_config()
    verified = []
    for purpose, channel in sorted(channels.items()):
        phone = channel["from"]
        query = urllib.parse.urlencode({
            "filter[phone_number]": phone,
            "page[size]": "1",
            "handle_messaging_profile_error": "true",
        })
        payload = _request_json(f"/phone_numbers?{query}", api_key=channel["apiKey"])
        rows = payload.get("data") if isinstance(payload.get("data"), list) else []
        exact = next(
            (
                row for row in rows
                if isinstance(row, dict) and _clean(row.get("phone_number")) == phone
            ),
            None,
        )
        if not exact:
            raise RuntimeError(f"telnyx_{purpose}_sender_not_found")
        verified.append({
            "purpose": purpose,
            "from": phone,
            "messagingProfileConfigured": bool(_clean(exact.get("messaging_profile_id"))),
        })
    return {"ok": True, "provider": "telnyx", "channels": verified}


def send_message(payload):
    purpose, channel = _channel(payload.get("purpose"))
    to = _normalize_phone(payload.get("to"))
    text = _clean(payload.get("body"))
    if not text:
        raise ValueError("telnyx_body_required")
    if len(text) > MAX_SMS_BODY_CHARS:
        raise ValueError("telnyx_body_too_long")

    result = _request_json(
        "/messages",
        api_key=channel["apiKey"],
        method="POST",
        body={
            "from": channel["from"],
            "to": to,
            "text": text,
        },
    )
    data = result.get("data") if isinstance(result.get("data"), dict) else result
    recipients = data.get("to") if isinstance(data, dict) and isinstance(data.get("to"), list) else []
    recipient = recipients[0] if recipients and isinstance(recipients[0], dict) else {}
    message_id = _clean(data.get("id") if isinstance(data, dict) else None) or None
    message_status = _clean(recipient.get("status")) or _clean(data.get("status") if isinstance(data, dict) else None) or "queued"
    return {
        "ok": True,
        "provider": "telnyx",
        "purpose": purpose,
        "id": message_id,
        "status": message_status,
        "from": channel["from"],
        "to": to,
    }
