import base64
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import boto3

QUEUE_URL = os.environ["BACKGROUND_CRON_QUEUE_URL"]
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_SECRET_ID = os.environ["SUPABASE_SERVICE_ROLE_SECRET_ID"]

ALLOWED_JOBS = {
    "location-search-profile-worker": "/api/cron/managed?job=location-search-profile-worker",
    "catalog-enrichment-runner": "/api/cron/managed?job=catalog-enrichment-runner",
    "location-description-backfill": "/api/cron/managed?job=location-description-backfill",
}

sqs = boto3.client("sqs")
secrets = boto3.client("secretsmanager")
_service_role_key = None


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": json.dumps(body, separators=(",", ":")),
    }


def _service_role():
    global _service_role_key
    if _service_role_key:
        return _service_role_key
    raw = secrets.get_secret_value(SecretId=SUPABASE_SERVICE_ROLE_SECRET_ID).get("SecretString") or ""
    value = raw.strip()
    if value.startswith("{"):
        parsed = json.loads(value)
        value = str(parsed.get("SUPABASE_SERVICE_ROLE_KEY") or parsed.get("service_role") or "").strip()
    if not value:
        raise RuntimeError("supabase_service_role_secret_empty")
    _service_role_key = value
    return value


def _decode_body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("request_body_must_be_object")
    return parsed


def _verify_signal_token(token):
    if not token:
        return False
    key = _service_role()
    request = Request(
        f"{SUPABASE_URL}/rest/v1/rpc/verify_aws_background_work_signal",
        data=json.dumps({"p_token": token}, separators=(",", ":")).encode("utf-8"),
        headers={
            "apikey": key,
            "authorization": f"Bearer {key}",
            "content-type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=5) as response:
            result = json.loads(response.read().decode("utf-8") or "false")
            return result is True
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
        return False


def handler(event, context):
    method = str(((event.get("requestContext") or {}).get("http") or {}).get("method") or "POST").upper()
    if method != "POST":
        return _response(405, {"ok": False, "error": "method_not_allowed"})

    headers = {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}
    token = headers.get("x-toh-work-signal", "").strip()
    if not _verify_signal_token(token):
        return _response(401, {"ok": False, "error": "unauthorized"})

    try:
        body = _decode_body(event)
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return _response(400, {"ok": False, "error": "invalid_json"})

    job = str(body.get("job") or "").strip()
    target = ALLOWED_JOBS.get(job)
    if not target:
        return _response(400, {"ok": False, "error": "unsupported_job"})

    envelope = {
        "version": 1,
        "jobType": "background.cron",
        "source": "database-work-signal",
        "target": target,
        "payload": {},
    }
    result = sqs.send_message(
        QueueUrl=QUEUE_URL,
        MessageBody=json.dumps(envelope, separators=(",", ":")),
    )
    print(json.dumps({
        "event": "background_work_signaled",
        "job": job,
        "messageId": result.get("MessageId"),
    }, separators=(",", ":")))
    return _response(202, {"ok": True, "job": job, "queued": True})
