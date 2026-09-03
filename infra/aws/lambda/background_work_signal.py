import base64
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import boto3

QUEUE_URL = os.environ["BACKGROUND_CRON_QUEUE_URL"]
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_SECRET_ID = os.environ["SUPABASE_SERVICE_ROLE_SECRET_ID"]

WORKER_DISPATCH_JOB_TYPES = [
    "photo.backfill",
    "enrichment.google_photos",
    "nightly-photo-backfill",
    "enrichment.google_metadata",
    "search.anchor.reconcile",
    "search.qa.batch",
    "reservation.cleanup",
    "search.document_rebuild",
    "search.embedding_generation",
    "analytics.aggregate",
    "enrichment.ai_profile",
    "enrichment.ai_menu",
    "ml.duplicate_detection.recalculate",
    "review.moderation",
    "location.publishability_repair",
]

ALLOWED_JOBS = {
    "location-search-profile-worker": "/api/cron/managed?job=location-search-profile-worker",
    "catalog-enrichment-runner": "/api/cron/managed?job=catalog-enrichment-runner",
    "location-description-backfill": "/api/cron/managed?job=location-description-backfill",
    "search-ml-learning-maintenance": "/api/cron/managed?job=search-ml-learning-maintenance",
    "claim-qr-repair-worker": "edge:claim-qr-repair-worker",
    "unified-location-gap-repair": "edge:unified-location-gap-repair",
    "worker-dispatcher-unified": "edge:worker-dispatcher",
    "location-enrichment-reconcile": "edge:aws-db-maintenance",
    "cron-alert-dispatcher": "/api/cron/managed?job=cron-alert-dispatcher",
}

JOB_DELAY_SECONDS = {
    "cron-alert-dispatcher": 300,
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


def _payload_for_job(job):
    if job == "worker-dispatcher-unified":
        return {
            "limit": 25,
            "lease_seconds": 300,
            "worker_name": "production-event-worker",
            "job_types": WORKER_DISPATCH_JOB_TYPES,
            "source": "database_work_signal",
        }
    if job == "location-enrichment-reconcile":
        return {
            "operation": "location_enrichment_reconcile",
            "source": "database_work_signal",
        }
    return {}


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
        "payload": _payload_for_job(job),
    }
    delay_seconds = JOB_DELAY_SECONDS.get(job, 0)
    result = sqs.send_message(
        QueueUrl=QUEUE_URL,
        MessageBody=json.dumps(envelope, separators=(",", ":")),
        DelaySeconds=delay_seconds,
    )
    print(json.dumps({
        "event": "background_work_signaled",
        "job": job,
        "delaySeconds": delay_seconds,
        "messageId": result.get("MessageId"),
    }, separators=(",", ":")))
    return _response(202, {"ok": True, "job": job, "queued": True})