import base64
import hashlib
import json
import os
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import boto3

QUEUE_URL = os.environ["BACKGROUND_CRON_QUEUE_URL"]
QUEUE_ARN = os.environ["BACKGROUND_CRON_QUEUE_ARN"]
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_SECRET_ID = os.environ["SUPABASE_SERVICE_ROLE_SECRET_ID"]
SCHEDULER_GROUP_NAME = os.environ["SCHEDULER_GROUP_NAME"]
SCHEDULER_TARGET_ROLE_ARN = os.environ["SCHEDULER_TARGET_ROLE_ARN"]

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
scheduler = boto3.client("scheduler")
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


def _payload_for_job(job, request_body):
    payload = request_body.get("payload")
    if payload is not None and not isinstance(payload, dict):
        raise ValueError("payload_must_be_object")
    result = dict(payload or {})
    if job == "worker-dispatcher-unified":
        result.update({
            "limit": 25,
            "lease_seconds": 300,
            "worker_name": "production-event-worker",
            "job_types": WORKER_DISPATCH_JOB_TYPES,
            "source": "database_work_signal",
        })
    elif job == "location-enrichment-reconcile":
        result.update({
            "operation": "location_enrichment_reconcile",
            "source": "database_work_signal",
        })
    return result


def _envelope(job, target, request_body):
    return {
        "version": 1,
        "jobType": "background.cron",
        "source": "database-work-signal",
        "target": target,
        "payload": _payload_for_job(job, request_body),
    }


def _parse_run_at(value):
    raw = str(value or "").strip()
    if not raw:
        return None
    normalized = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError("invalid_run_at") from exc
    if parsed.tzinfo is None:
        raise ValueError("run_at_timezone_required")
    parsed = parsed.astimezone(timezone.utc).replace(microsecond=0)
    if parsed.timestamp() <= datetime.now(timezone.utc).timestamp() + 1:
        raise ValueError("run_at_must_be_future")
    return parsed


def _schedule_name(job, schedule_key):
    key = str(schedule_key or "").strip()
    if not key:
        raise ValueError("schedule_key_required")
    prefix = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in job)[:24].strip("-") or "job"
    digest = hashlib.sha256(f"{job}:{key}".encode("utf-8")).hexdigest()[:28]
    return f"toh-{prefix}-{digest}"[:64]


def _schedule_target(envelope):
    return {
        "Arn": QUEUE_ARN,
        "RoleArn": SCHEDULER_TARGET_ROLE_ARN,
        "Input": json.dumps(envelope, separators=(",", ":")),
        "RetryPolicy": {
            "MaximumEventAgeInSeconds": 3600,
            "MaximumRetryAttempts": 3,
        },
    }


def _upsert_one_shot(job, schedule_key, run_at, envelope):
    name = _schedule_name(job, schedule_key)
    expression = f"at({run_at.strftime('%Y-%m-%dT%H:%M:%S')})"
    params = {
        "Name": name,
        "GroupName": SCHEDULER_GROUP_NAME,
        "ScheduleExpression": expression,
        "ScheduleExpressionTimezone": "UTC",
        "FlexibleTimeWindow": {"Mode": "OFF"},
        "Target": _schedule_target(envelope),
        "State": "ENABLED",
        "ActionAfterCompletion": "DELETE",
        "Description": f"TheOutHaven exact wake for {job}",
    }
    try:
        scheduler.create_schedule(**params)
        action = "created"
    except scheduler.exceptions.ConflictException:
        scheduler.update_schedule(**params)
        action = "updated"
    print(json.dumps({
        "event": "background_one_shot_scheduled",
        "job": job,
        "scheduleName": name,
        "runAt": run_at.isoformat(),
        "action": action,
    }, separators=(",", ":")))
    return name, action


def _cancel_one_shot(job, schedule_key):
    name = _schedule_name(job, schedule_key)
    try:
        scheduler.delete_schedule(Name=name, GroupName=SCHEDULER_GROUP_NAME)
        deleted = True
    except scheduler.exceptions.ResourceNotFoundException:
        deleted = False
    print(json.dumps({
        "event": "background_one_shot_cancelled",
        "job": job,
        "scheduleName": name,
        "deleted": deleted,
    }, separators=(",", ":")))
    return name, deleted


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
        job = str(body.get("job") or "").strip()
        target = ALLOWED_JOBS.get(job)
        if not target:
            return _response(400, {"ok": False, "error": "unsupported_job"})

        schedule_key = body.get("scheduleKey")
        if body.get("cancel") is True:
            name, deleted = _cancel_one_shot(job, schedule_key)
            return _response(202, {
                "ok": True,
                "job": job,
                "scheduled": False,
                "cancelled": True,
                "deleted": deleted,
                "scheduleName": name,
            })

        envelope = _envelope(job, target, body)
        run_at = _parse_run_at(body.get("runAt"))
        if run_at:
            name, action = _upsert_one_shot(job, schedule_key, run_at, envelope)
            return _response(202, {
                "ok": True,
                "job": job,
                "queued": False,
                "scheduled": True,
                "scheduleName": name,
                "scheduleAction": action,
                "runAt": run_at.isoformat(),
            })

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
    except ValueError as exc:
        return _response(400, {"ok": False, "error": str(exc)})
