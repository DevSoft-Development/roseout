import base64
import hashlib
import hmac
import json
import os
import re
import time

import boto3
from botocore.exceptions import ClientError

EMAIL_QUEUE_URL = os.environ["EMAIL_QUEUE_URL"]
SHARED_SECRET_ARN = os.environ["SHARED_SECRET_ARN"]
ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
MAX_JOBS = 10
MAX_MESSAGE_BYTES = 240 * 1024
IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9:_./@+-]{8,200}$")

sqs = boto3.client("sqs")
secrets = boto3.client("secretsmanager")
_secret_cache = None


def _response(status, payload):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": json.dumps(payload, separators=(",", ":"), default=str),
    }


def _headers(event):
    return {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}


def _body(event):
    value = event.get("body") or ""
    if event.get("isBase64Encoded"):
        return base64.b64decode(value).decode("utf-8")
    return value


def _secret():
    global _secret_cache
    if _secret_cache:
        return _secret_cache
    result = secrets.get_secret_value(SecretId=SHARED_SECRET_ARN)
    value = result.get("SecretString")
    if not value:
        raise RuntimeError("platform_job_gateway_secret_missing")
    _secret_cache = value
    return value


def _authorized(event, body):
    headers = _headers(event)
    timestamp = headers.get("x-toh-timestamp", "")
    signature = headers.get("x-toh-signature", "")
    if not timestamp or not signature:
        return False
    try:
        timestamp_ms = int(timestamp)
    except ValueError:
        return False
    if abs(int(time.time() * 1000) - timestamp_ms) > MAX_CLOCK_SKEW_MS:
        return False
    http = (event.get("requestContext") or {}).get("http") or {}
    method = str(http.get("method") or "POST").upper()
    path = str(event.get("rawPath") or "/")
    signed = "\n".join([timestamp, method, path, body])
    expected = hmac.new(_secret().encode(), signed.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _validate_job(raw):
    if not isinstance(raw, dict):
        raise ValueError("invalid_job")
    job_type = str(raw.get("jobType") or "").strip()
    if job_type != "email.send":
        raise ValueError("unsupported_job_type")
    key = str(raw.get("idempotencyKey") or "").strip()
    if not IDEMPOTENCY_RE.match(key):
        raise ValueError("invalid_idempotency_key")
    payload = raw.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("invalid_job_payload")
    envelope = {
        "version": 1,
        "jobType": job_type,
        "idempotencyKey": key,
        "payload": payload,
        "enqueuedAt": int(time.time()),
        "environment": ENVIRONMENT,
    }
    encoded = json.dumps(envelope, separators=(",", ":"), ensure_ascii=False)
    if len(encoded.encode("utf-8")) > MAX_MESSAGE_BYTES:
        raise ValueError("job_payload_too_large")
    return key, encoded


def _send_batch(jobs):
    if not isinstance(jobs, list) or not jobs or len(jobs) > MAX_JOBS:
        raise ValueError("invalid_job_batch")

    entries = []
    keys = []
    for index, raw in enumerate(jobs):
        key, body = _validate_job(raw)
        keys.append(key)
        entries.append({
            "Id": str(index),
            "MessageBody": body,
            "MessageAttributes": {
                "jobType": {"DataType": "String", "StringValue": "email.send"},
                "idempotencyKey": {"DataType": "String", "StringValue": key},
            },
        })

    response = sqs.send_message_batch(QueueUrl=EMAIL_QUEUE_URL, Entries=entries)
    success_by_id = {str(item.get("Id")): item for item in response.get("Successful") or []}
    failed_by_id = {str(item.get("Id")): item for item in response.get("Failed") or []}
    results = []
    for index, key in enumerate(keys):
        item_id = str(index)
        if item_id in success_by_id:
            results.append({
                "idempotencyKey": key,
                "accepted": True,
                "messageId": success_by_id[item_id].get("MessageId"),
            })
        else:
            failure = failed_by_id.get(item_id) or {}
            results.append({
                "idempotencyKey": key,
                "accepted": False,
                "error": failure.get("Code") or "sqs_batch_entry_failed",
            })
    accepted = sum(1 for item in results if item["accepted"])
    return {"ok": accepted == len(results), "accepted": accepted, "failed": len(results) - accepted, "results": results}


def handler(event, context):
    try:
        body = _body(event)
        if not _authorized(event, body):
            return _response(401, {"ok": False, "error": "unauthorized"})
        http = (event.get("requestContext") or {}).get("http") or {}
        method = str(http.get("method") or "GET").upper()
        path = str(event.get("rawPath") or "/")
        if method == "GET" and path == "/v1/status":
            return _response(200, {"ok": True, "authenticated": True, "environment": ENVIRONMENT})
        if method == "POST" and path == "/v1/jobs/enqueue-batch":
            payload = json.loads(body or "{}")
            result = _send_batch(payload.get("jobs"))
            return _response(200 if result["ok"] else 207, result)
        return _response(404, {"ok": False, "error": "not_found"})
    except ValueError as error:
        return _response(400, {"ok": False, "error": str(error)})
    except ClientError as error:
        code = error.response.get("Error", {}).get("Code") or "aws_error"
        print(json.dumps({"event": "platform_job_gateway_aws_error", "code": code, "requestId": getattr(context, "aws_request_id", None)}))
        return _response(502, {"ok": False, "error": "aws_provider_error", "code": code})
    except Exception as error:
        print(json.dumps({"event": "platform_job_gateway_error", "error": type(error).__name__, "requestId": getattr(context, "aws_request_id", None)}))
        return _response(500, {"ok": False, "error": "internal_error"})
