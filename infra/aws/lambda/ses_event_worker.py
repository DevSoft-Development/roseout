import hashlib
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import boto3

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_SECRET_ARN = os.environ["SUPABASE_SERVICE_ROLE_SECRET_ARN"]
PROVIDER = "ses"

secrets = boto3.client("secretsmanager")
ses = boto3.client("sesv2")
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


def _headers(prefer=None):
    key = _secret(SUPABASE_SERVICE_ROLE_SECRET_ARN)
    headers = {
        "apikey": key,
        "authorization": f"Bearer {key}",
        "content-type": "application/json",
    }
    if prefer:
        headers["prefer"] = prefer
    return headers


def _request(method, path, body=None, prefer=None):
    data = None if body is None else json.dumps(body, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        data=data,
        headers=_headers(prefer),
        method=method,
    )
    with urllib.request.urlopen(request, timeout=12) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else None


def _iso(value):
    text = str(value or "").strip()
    if not text:
        return datetime.now(timezone.utc).isoformat()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text).astimezone(timezone.utc).isoformat()
    except ValueError:
        return datetime.now(timezone.utc).isoformat()


def _event_type(payload):
    raw = str(payload.get("eventType") or payload.get("notificationType") or "unknown").strip().lower()
    compact = raw.replace(" ", "").replace("_", "")
    mapping = {
        "send": "send",
        "delivery": "delivery",
        "bounce": "bounce",
        "complaint": "complaint",
        "open": "open",
        "click": "click",
        "reject": "reject",
        "renderingfailure": "rendering_failure",
        "deliverydelay": "delivery_delay",
        "subscription": "subscription",
    }
    return mapping.get(compact, raw.replace(" ", "_") or "unknown")


def _event_details(payload, event_type):
    if event_type == "bounce":
        return payload.get("bounce") or {}
    if event_type == "complaint":
        return payload.get("complaint") or {}
    if event_type == "delivery":
        return payload.get("delivery") or {}
    if event_type == "open":
        return payload.get("open") or {}
    if event_type == "click":
        return payload.get("click") or {}
    if event_type == "reject":
        return payload.get("reject") or {}
    if event_type == "rendering_failure":
        return payload.get("failure") or payload.get("renderingFailure") or {}
    if event_type == "delivery_delay":
        return payload.get("deliveryDelay") or {}
    return {}


def _occurred_at(payload, event_type):
    detail = _event_details(payload, event_type)
    mail = payload.get("mail") or {}
    return _iso(detail.get("timestamp") or mail.get("timestamp"))


def _tag_values(payload):
    tags = (payload.get("mail") or {}).get("tags") or {}
    normalized = {}
    if isinstance(tags, dict):
        for key, value in tags.items():
            if isinstance(value, list):
                normalized[str(key)] = [str(item) for item in value]
            elif value is not None:
                normalized[str(key)] = [str(value)]
    return normalized


def _first_tag(tags, *names):
    for name in names:
        values = tags.get(name) or []
        if values:
            return str(values[0])
    return None


def _recipient_records(payload, event_type):
    detail = _event_details(payload, event_type)
    mail = payload.get("mail") or {}
    records = []

    if event_type == "bounce":
        for item in detail.get("bouncedRecipients") or []:
            if isinstance(item, dict) and item.get("emailAddress"):
                records.append({
                    "email": str(item.get("emailAddress")).lower(),
                    "diagnostic": str(item.get("diagnosticCode") or item.get("status") or "hard_bounce")[:500],
                    "metadata": {
                        "bounceType": detail.get("bounceType"),
                        "bounceSubType": detail.get("bounceSubType"),
                        "status": item.get("status"),
                        "action": item.get("action"),
                    },
                })
    elif event_type == "complaint":
        for item in detail.get("complainedRecipients") or []:
            if isinstance(item, dict) and item.get("emailAddress"):
                records.append({
                    "email": str(item.get("emailAddress")).lower(),
                    "diagnostic": str(detail.get("complaintFeedbackType") or "complaint")[:500],
                    "metadata": {
                        "feedbackType": detail.get("complaintFeedbackType"),
                        "userAgent": detail.get("userAgent"),
                    },
                })
    elif event_type == "delivery":
        for email in detail.get("recipients") or []:
            records.append({"email": str(email).lower(), "diagnostic": None, "metadata": {}})

    if not records:
        for email in mail.get("destination") or []:
            records.append({"email": str(email).lower(), "diagnostic": None, "metadata": {}})

    if not records:
        records.append({"email": None, "diagnostic": None, "metadata": {}})
    return records


def _lookup_send_log(message_id, tagged_log_id=None):
    if tagged_log_id:
        rows = _request(
            "GET",
            "marketing_send_logs?" + urllib.parse.urlencode({
                "select": "id,campaign_id,recipient_email,status,provider_response",
                "id": f"eq.{tagged_log_id}",
                "limit": "1",
            }),
        ) or []
        if rows:
            return rows[0]

    if not message_id:
        return None
    query = urllib.parse.quote(message_id, safe="")
    rows = _request(
        "GET",
        f"marketing_send_logs?select=id,campaign_id,recipient_email,status,provider_response&provider=eq.ses&provider_response-%3E%3Eid=eq.{query}&limit=1",
    ) or []
    return rows[0] if rows else None


def _insert_provider_event(provider_event_id, message_id, send_log, recipient, event_type, diagnostic, metadata, raw_payload, occurred_at):
    payload = {
        "provider": PROVIDER,
        "provider_event_id": provider_event_id,
        "provider_message_id": message_id or None,
        "marketing_send_log_id": send_log.get("id") if send_log else None,
        "campaign_id": send_log.get("campaign_id") if send_log else None,
        "recipient_email": recipient,
        "event_type": event_type,
        "diagnostic_code": diagnostic,
        "metadata": metadata,
        "raw_payload": raw_payload,
        "occurred_at": occurred_at,
    }
    path = "email_provider_events?on_conflict=provider,provider_event_id"
    rows = _request("POST", path, payload, "resolution=ignore-duplicates,return=representation") or []
    return rows[0] if rows else None


def _patch_send_log(send_log, event_type, occurred_at, diagnostic):
    if not send_log:
        return
    log_id = send_log.get("id")
    if not log_id:
        return

    status_filter = None
    patch = {}
    if event_type in {"send", "delivery"}:
        status_filter = "eq.pending"
        patch = {"status": "sent", "sent_at": occurred_at, "error_message": None}
    elif event_type == "open":
        status_filter = "in.(pending,sent,opened)"
        patch = {"status": "opened", "opened_at": occurred_at}
    elif event_type == "click":
        status_filter = "in.(pending,sent,opened,clicked)"
        patch = {"status": "clicked", "clicked_at": occurred_at}
    elif event_type in {"bounce", "complaint", "reject", "rendering_failure"}:
        patch = {"status": "failed", "error_message": str(diagnostic or event_type)[:500]}
    else:
        return

    params = {"id": f"eq.{log_id}"}
    if status_filter:
        params["status"] = status_filter
    _request("PATCH", "marketing_send_logs?" + urllib.parse.urlencode(params, safe="().,"), patch, "return=minimal")


def _upsert_suppression(email, reason, event_id, occurred_at, metadata):
    if not email:
        return
    query = urllib.parse.urlencode({
        "select": "id",
        "email": f"eq.{email.lower()}",
        "provider": f"eq.{PROVIDER}",
        "reason": f"eq.{reason}",
        "active": "eq.true",
        "limit": "1",
    })
    rows = _request("GET", f"email_suppressions?{query}") or []
    patch = {
        "source_event_id": event_id,
        "last_event_at": occurred_at,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "metadata": metadata,
    }
    if rows:
        _request("PATCH", f"email_suppressions?id=eq.{rows[0]['id']}", patch, "return=minimal")
        return
    _request("POST", "email_suppressions", {
        "email": email.lower(),
        "provider": PROVIDER,
        "reason": reason,
        "source_event_id": event_id,
        "active": True,
        "suppressed_at": occurred_at,
        "last_event_at": occurred_at,
        "metadata": metadata,
    }, "return=minimal")


def _provider_suppress(email, event_type):
    if not email or event_type not in {"bounce", "complaint"}:
        return
    ses.put_suppressed_destination(
        EmailAddress=email.lower(),
        Reason="BOUNCE" if event_type == "bounce" else "COMPLAINT",
    )


def _reconcile_campaign(campaign_id):
    if not campaign_id:
        return
    rows = _request(
        "GET",
        "marketing_send_logs?" + urllib.parse.urlencode({
            "select": "status",
            "campaign_id": f"eq.{campaign_id}",
            "channel": "eq.email",
            "provider": "eq.ses",
            "limit": "2000",
        }),
    ) or []
    if not rows:
        return

    statuses = [str(row.get("status") or "") for row in rows]
    pending = any(status == "pending" for status in statuses)
    successes = any(status in {"sent", "opened", "clicked"} for status in statuses)
    if pending:
        patch = {"status": "scheduled"}
    elif successes:
        patch = {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()}
    else:
        patch = {"status": "failed"}

    _request("PATCH", f"marketing_campaigns?id=eq.{campaign_id}", patch, "return=minimal")


def _provider_event_id(sns_message_id, event_type, message_id, recipient, occurred_at):
    material = "|".join([
        str(sns_message_id or ""),
        str(event_type or ""),
        str(message_id or ""),
        str(recipient or ""),
        str(occurred_at or ""),
    ])
    return "ses:" + hashlib.sha256(material.encode("utf-8")).hexdigest()


def _process_sns_record(record):
    sns_record = record.get("Sns") or {}
    message = sns_record.get("Message")
    payload = json.loads(message) if isinstance(message, str) else (message or {})
    event_type = _event_type(payload)
    occurred_at = _occurred_at(payload, event_type)
    mail = payload.get("mail") or {}
    message_id = str(mail.get("messageId") or "")
    tags = _tag_values(payload)
    tagged_log_id = _first_tag(tags, "send_log", "marketing_send_log_id")
    send_log = _lookup_send_log(message_id, tagged_log_id)

    event_ids = []
    for recipient_record in _recipient_records(payload, event_type):
        recipient = recipient_record.get("email") or (send_log or {}).get("recipient_email")
        diagnostic = recipient_record.get("diagnostic")
        metadata = {
            "snsMessageId": sns_record.get("MessageId"),
            "tags": tags,
            "detail": recipient_record.get("metadata") or {},
        }
        provider_event_id = _provider_event_id(
            sns_record.get("MessageId"), event_type, message_id, recipient, occurred_at,
        )
        inserted = _insert_provider_event(
            provider_event_id,
            message_id,
            send_log,
            recipient,
            event_type,
            diagnostic,
            metadata,
            payload,
            occurred_at,
        )
        event_id = inserted.get("id") if inserted else None
        if event_id:
            event_ids.append(event_id)
            if event_type == "bounce":
                _upsert_suppression(recipient, "hard_bounce", event_id, occurred_at, metadata)
            elif event_type == "complaint":
                _upsert_suppression(recipient, "complaint", event_id, occurred_at, metadata)
        if event_type in {"bounce", "complaint"}:
            _provider_suppress(recipient, event_type)

    detail = _event_details(payload, event_type) or {}
    diagnostic = detail.get("diagnosticCode") or detail.get("reason") or detail.get("complaintFeedbackType")
    _patch_send_log(send_log, event_type, occurred_at, diagnostic)
    if send_log and event_type in {"send", "delivery", "bounce", "complaint", "reject", "rendering_failure"}:
        _reconcile_campaign(send_log.get("campaign_id"))

    print(json.dumps({
        "event": "ses_provider_event_processed",
        "eventType": event_type,
        "providerMessageId": message_id,
        "sendLogId": (send_log or {}).get("id"),
        "campaignId": (send_log or {}).get("campaign_id"),
        "insertedEvents": len(event_ids),
    }))


def handler(event, context):
    failures = 0
    for record in event.get("Records") or []:
        try:
            _process_sns_record(record)
        except Exception as error:
            failures += 1
            print(json.dumps({
                "event": "ses_provider_event_error",
                "error": type(error).__name__,
                "requestId": getattr(context, "aws_request_id", None),
            }))
            raise
    return {"ok": failures == 0, "processed": len(event.get("Records") or [])}
