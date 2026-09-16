import json
import os
import re
import urllib.error
import urllib.request

import boto3

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
CREDENTIAL_VAULT_PREFIX = os.environ.get("CREDENTIAL_VAULT_PREFIX", "/theouthaven/credential-vault")
TELNYX_SECRET_ID = f"{CREDENTIAL_VAULT_PREFIX}/{ENVIRONMENT}/telnyx"
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


def _read_telnyx():
    try:
        raw = secrets.get_secret_value(SecretId=TELNYX_SECRET_ID).get("SecretString") or "{}"
        value = json.loads(raw)
        if not isinstance(value, dict):
            return {}
        return value
    except Exception:
        return {}


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
    api_key = str(cfg.get("transactionalApiKey") or cfg.get("supportApiKey") or "").strip()
    from_number = _clean_phone(CRITICAL_SMS_FROM)
    to_number = _clean_phone(CRITICAL_SMS_TO)
    configured = bool(api_key and from_number and to_number)

    results = []
    for record in event.get("Records") or []:
        subject, message, state = _sns_message(record)
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

    return {"ok": all(item.get("sent") for item in results) if results else True, "configured": configured, "deliveries": results}
