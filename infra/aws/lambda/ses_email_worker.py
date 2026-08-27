import json
import os
import re
import time

import boto3
from botocore.exceptions import ClientError

CONFIGURATION_SET = os.environ["SES_CONFIGURATION_SET"]
IDEMPOTENCY_TABLE = os.environ["IDEMPOTENCY_TABLE"]
ALLOWED_FROM_DOMAIN = os.environ.get("ALLOWED_FROM_DOMAIN", "theouthaven.com").lower()
LEASE_SECONDS = 300
RETENTION_SECONDS = 30 * 24 * 60 * 60
MAX_RECIPIENTS = 50
EMAIL_RE = re.compile(r"^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$")

ses = boto3.client("sesv2")
dynamodb = boto3.client("dynamodb")


def _list(value):
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    raise ValueError("invalid_recipient_list")


def _extract_email(value):
    text = str(value or "").strip()
    if "<" in text and text.endswith(">"):
        text = text.rsplit("<", 1)[1][:-1].strip()
    return text.lower()


def _validate_address(value, field):
    address = _extract_email(value)
    if not EMAIL_RE.match(address):
        raise ValueError(f"invalid_{field}")
    return str(value).strip()


def _validate_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError("invalid_email_payload")
    from_value = _validate_address(payload.get("from"), "from")
    from_email = _extract_email(from_value)
    if not from_email.endswith(f"@{ALLOWED_FROM_DOMAIN}"):
        raise ValueError("from_domain_not_allowed")

    to = [_validate_address(item, "to") for item in _list(payload.get("to"))]
    cc = [_validate_address(item, "cc") for item in _list(payload.get("cc"))]
    bcc = [_validate_address(item, "bcc") for item in _list(payload.get("bcc"))]
    if not to:
        raise ValueError("missing_recipient")
    if len(to) + len(cc) + len(bcc) > MAX_RECIPIENTS:
        raise ValueError("too_many_recipients")

    subject = str(payload.get("subject") or "").strip()
    html = str(payload.get("html") or "")
    text = str(payload.get("text") or "")
    if not subject or len(subject) > 998:
        raise ValueError("invalid_subject")
    if not html and not text:
        raise ValueError("missing_email_content")

    reply_to = [_validate_address(item, "reply_to") for item in _list(payload.get("replyTo"))]
    tags = []
    raw_tags = payload.get("tags") or {}
    if isinstance(raw_tags, dict):
        for key, value in list(raw_tags.items())[:20]:
            name = re.sub(r"[^A-Za-z0-9_-]", "-", str(key))[:256]
            tag_value = re.sub(r"[^A-Za-z0-9_-]", "-", str(value))[:256]
            if name and tag_value:
                tags.append({"Name": name, "Value": tag_value})

    return {
        "from": from_value,
        "to": to,
        "cc": cc,
        "bcc": bcc,
        "reply_to": reply_to,
        "subject": subject,
        "html": html,
        "text": text,
        "tags": tags,
    }


def _acquire(key):
    now = int(time.time())
    try:
        dynamodb.put_item(
            TableName=IDEMPOTENCY_TABLE,
            Item={
                "idempotency_key": {"S": key},
                "status": {"S": "processing"},
                "lease_expires_at": {"N": str(now + LEASE_SECONDS)},
                "expires_at": {"N": str(now + RETENTION_SECONDS)},
                "updated_at": {"N": str(now)},
            },
            ConditionExpression="attribute_not_exists(idempotency_key) OR lease_expires_at < :now",
            ExpressionAttributeValues={":now": {"N": str(now)}},
        )
        return "acquired"
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
        current = dynamodb.get_item(
            TableName=IDEMPOTENCY_TABLE,
            Key={"idempotency_key": {"S": key}},
            ConsistentRead=True,
        ).get("Item") or {}
        status = (current.get("status") or {}).get("S")
        return "sent" if status == "sent" else "in_progress"


def _mark_sent(key, message_id):
    now = int(time.time())
    dynamodb.update_item(
        TableName=IDEMPOTENCY_TABLE,
        Key={"idempotency_key": {"S": key}},
        UpdateExpression="SET #status = :sent, provider_message_id = :message_id, updated_at = :now, expires_at = :expires REMOVE lease_expires_at",
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={
            ":sent": {"S": "sent"},
            ":message_id": {"S": str(message_id or "unknown")},
            ":now": {"N": str(now)},
            ":expires": {"N": str(now + RETENTION_SECONDS)},
        },
    )


def _mark_retryable(key, code):
    now = int(time.time())
    dynamodb.update_item(
        TableName=IDEMPOTENCY_TABLE,
        Key={"idempotency_key": {"S": key}},
        UpdateExpression="SET #status = :failed, last_error = :error, lease_expires_at = :zero, updated_at = :now, expires_at = :expires",
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={
            ":failed": {"S": "failed"},
            ":error": {"S": str(code or "send_failed")[:500]},
            ":zero": {"N": "0"},
            ":now": {"N": str(now)},
            ":expires": {"N": str(now + RETENTION_SECONDS)},
        },
    )


def _send(envelope):
    if not isinstance(envelope, dict) or envelope.get("jobType") != "email.send":
        raise ValueError("invalid_email_job")
    key = str(envelope.get("idempotencyKey") or "").strip()
    if not key:
        raise ValueError("missing_idempotency_key")

    lease_state = _acquire(key)
    if lease_state in {"sent", "in_progress"}:
        return {"status": lease_state, "idempotencyKey": key}

    payload = _validate_payload(envelope.get("payload"))
    destination = {"ToAddresses": payload["to"]}
    if payload["cc"]:
        destination["CcAddresses"] = payload["cc"]
    if payload["bcc"]:
        destination["BccAddresses"] = payload["bcc"]

    body = {}
    if payload["html"]:
        body["Html"] = {"Data": payload["html"], "Charset": "UTF-8"}
    if payload["text"]:
        body["Text"] = {"Data": payload["text"], "Charset": "UTF-8"}

    try:
        response = ses.send_email(
            FromEmailAddress=payload["from"],
            Destination=destination,
            ReplyToAddresses=payload["reply_to"],
            Content={
                "Simple": {
                    "Subject": {"Data": payload["subject"], "Charset": "UTF-8"},
                    "Body": body,
                }
            },
            ConfigurationSetName=CONFIGURATION_SET,
            EmailTags=payload["tags"],
        )
    except Exception as error:
        code = error.response.get("Error", {}).get("Code") if isinstance(error, ClientError) else type(error).__name__
        _mark_retryable(key, code)
        raise

    message_id = response.get("MessageId")
    _mark_sent(key, message_id)
    print(json.dumps({"event": "ses_email_sent", "idempotencyKey": key, "messageId": message_id}))
    return {"status": "sent", "idempotencyKey": key, "messageId": message_id}


def handler(event, context):
    failures = []
    for record in event.get("Records") or []:
        message_id = str(record.get("messageId") or "")
        try:
            envelope = json.loads(record.get("body") or "{}")
            _send(envelope)
        except Exception as error:
            print(json.dumps({
                "event": "ses_email_worker_error",
                "messageId": message_id,
                "error": type(error).__name__,
                "requestId": getattr(context, "aws_request_id", None),
            }))
            failures.append({"itemIdentifier": message_id})
    return {"batchItemFailures": failures}
