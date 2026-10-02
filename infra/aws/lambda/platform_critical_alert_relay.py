import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

import boto3

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
CREDENTIAL_VAULT_PREFIX = os.environ.get("CREDENTIAL_VAULT_PREFIX", "/theouthaven/credential-vault")
TELNYX_SECRET_ID = f"{CREDENTIAL_VAULT_PREFIX}/{ENVIRONMENT}/telnyx"
PLATFORM_SECRET_ID = f"{CREDENTIAL_VAULT_PREFIX}/{ENVIRONMENT}/platform"
TELNYX_API_URL = "https://api.telnyx.com/v2/messages"
CRITICAL_SMS_FROM = os.environ.get("CRITICAL_SMS_FROM", "")
CRITICAL_SMS_TO = os.environ.get("CRITICAL_SMS_TO", "")

secrets = boto3.client("secretsmanager")


def _clean_phone(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits
    return raw if raw.startswith("+") else ""


def _read_secret(secret_id):
    try:
        raw = secrets.get_secret_value(SecretId=secret_id).get("SecretString") or "{}"
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def _read_telnyx():
    return _read_secret(TELNYX_SECRET_ID)


def _read_platform_policy():
    return _read_secret(PLATFORM_SECRET_ID)


def _bool_setting(value, default):
    raw = str(value or "").strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return default


def _parse_hhmm(value):
    raw = str(value or "").strip()
    try:
        hour, minute = raw.split(":", 1)
        hour = int(hour)
        minute = int(minute)
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return hour * 60 + minute
    except Exception:
        pass
    return None


def _quiet_hours_active(policy):
    start = _parse_hhmm(policy.get("criticalAlertQuietHoursStart"))
    end = _parse_hhmm(policy.get("criticalAlertQuietHoursEnd"))
    if start is None or end is None or start == end:
        return False
    timezone = str(policy.get("criticalAlertTimezone") or "America/New_York").strip()
    try:
        now = datetime.now(ZoneInfo(timezone))
    except Exception:
        now = datetime.now(ZoneInfo("UTC"))
    current = now.hour * 60 + now.minute
    if start < end:
        return start <= current < end
    return current >= start or current < end


def _sms_allowed(policy, state):
    if not _bool_setting(policy.get("criticalAlertSmsEnabled"), True):
        return False, "sms_disabled"
    if state == "OK" and not _bool_setting(policy.get("criticalAlertSmsRecoveryEnabled"), True):
        return False, "recovery_sms_disabled"

    mode = str(policy.get("criticalAlertQuietHoursMode") or "recoveries_only").strip().lower()
    if mode not in {"off", "recoveries_only", "all"}:
        mode = "recoveries_only"
    if mode == "off" or not _quiet_hours_active(policy):
        return True, ""
    if mode == "all" or (mode == "recoveries_only" and state == "OK"):
        return False, "quiet_hours"
    return True, ""


def _sns_message(record):
    sns = record.get("Sns") or {}
    subject = str(sns.get("Subject") or "TheOutHaven critical platform alert").strip()
    message = str(sns.get("Message") or "Critical platform alarm changed state.").strip()
    state = "ALARM"
    try:
        parsed = json.loads(message)
        if isinstance(parsed, dict):
            alarm = parsed.get("AlarmName") or parsed.get("alarmName") or subject
            state = str(parsed.get("NewStateValue") or parsed.get("state") or "ALARM").upper()
            reason = parsed.get("NewStateReason") or parsed.get("reason") or ""
            message = f"{alarm}: {state}. {reason}".strip()
    except Exception:
        pass
    return subject, message, state


def _sms_body(subject, message, state):
    prefix = "RECOVERED" if state == "OK" else "CRITICAL"
    combined = f"TheOutHaven {prefix}: {subject}. {message}"
    combined = re.sub(r"\s+", " ", combined).strip()
    return combined[:1450]


def _send_telnyx(api_key, from_number, to_number, text):
    payload = json.dumps({"from": from_number, "to": to_number, "text": text}).encode("utf-8")
    request = urllib.request.Request(
        TELNYX_API_URL,
        method="POST",
        data=payload,
        headers={
            "authorization": f"Bearer {api_key}",
            "content-type": "application/json",
            "user-agent": "TheOutHaven-Critical-Alert-Relay/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        body = response.read().decode("utf-8")
        return int(response.status), body[:1000]


def handler(event, context):
    cfg = _read_telnyx()
    policy = _read_platform_policy()
    api_key = str(cfg.get("transactionalApiKey") or cfg.get("supportApiKey") or "").strip()
    from_number = _clean_phone(policy.get("criticalAlertSmsFrom") or CRITICAL_SMS_FROM)
    to_number = _clean_phone(policy.get("criticalAlertSmsTo") or CRITICAL_SMS_TO)
    configured = bool(api_key and from_number and to_number)

    results = []
    for record in event.get("Records") or []:
        subject, message, state = _sns_message(record)
        allowed, suppress_reason = _sms_allowed(policy, state)
        if not allowed:
            results.append({"sent": False, "suppressed": True, "reason": suppress_reason})
            continue
        if not configured:
            results.append({"sent": False, "reason": "critical_sms_not_configured"})
            continue
        try:
            status, _ = _send_telnyx(api_key, from_number, to_number, _sms_body(subject, message, state))
            results.append({"sent": 200 <= status < 300, "status": status})
        except urllib.error.HTTPError as error:
            results.append({"sent": False, "status": int(error.code), "reason": "telnyx_http_error"})
        except Exception as error:
            results.append({"sent": False, "reason": type(error).__name__})

    successful = all(item.get("sent") or item.get("suppressed") for item in results) if results else True
    return {
        "ok": successful,
        "configured": configured,
        "policy": {
            "smsEnabled": _bool_setting(policy.get("criticalAlertSmsEnabled"), True),
            "recoverySmsEnabled": _bool_setting(policy.get("criticalAlertSmsRecoveryEnabled"), True),
            "quietHoursMode": str(policy.get("criticalAlertQuietHoursMode") or "recoveries_only"),
            "timezone": str(policy.get("criticalAlertTimezone") or "America/New_York"),
        },
        "deliveries": results,
    }
