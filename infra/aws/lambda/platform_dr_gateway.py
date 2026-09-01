import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

import boto3

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
SHARED_SECRET_ARN = os.environ["SHARED_SECRET_ARN"]
STATE_TABLE = os.environ["STATE_TABLE"]
PRIMARY_PROBE_URL = os.environ["PRIMARY_PROBE_URL"]
STANDBY_PROBE_URL = os.environ["STANDBY_PROBE_URL"]
PUBLIC_PROBE_URL = os.environ.get("PUBLIC_PROBE_URL", "https://www.theouthaven.com/api/health/platform-dr")
ECS_CLUSTER = os.environ["ECS_CLUSTER"]
ECS_SERVICE = os.environ["ECS_SERVICE"]
TARGET_GROUP_ARN = os.environ["TARGET_GROUP_ARN"]
LIVE_CONFIRMATION = os.environ.get("LIVE_CONFIRMATION", "LIVE PLATFORM FAILOVER")

MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
PROBE_TIMEOUT_SECONDS = 5
SURFACES = [
    ("public", "Public site", "/"),
    ("admin", "Admin dashboard", "/admin/login"),
    ("locations", "Location dashboard", "/locations/dashboard"),
]

secrets = boto3.client("secretsmanager")
dynamodb = boto3.client("dynamodb")
ecs = boto3.client("ecs")
elbv2 = boto3.client("elbv2")
_secret_cache = None


def _json_response(status_code, payload, extra_headers=None):
    headers = {"content-type": "application/json", "cache-control": "no-store, max-age=0"}
    if extra_headers:
        headers.update(extra_headers)
    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(payload, separators=(",", ":"), default=str),
    }


def _headers(event):
    return {str(key).lower(): str(value) for key, value in (event.get("headers") or {}).items()}


def _raw_body(event):
    body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        return base64.b64decode(body).decode("utf-8")
    return body


def _secret():
    global _secret_cache
    if _secret_cache:
        return _secret_cache
    value = secrets.get_secret_value(SecretId=SHARED_SECRET_ARN).get("SecretString")
    if not value:
        raise RuntimeError("platform_dr_gateway_secret_missing")
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
    method = str(((event.get("requestContext") or {}).get("http") or {}).get("method") or "GET").upper()
    path = str(event.get("rawPath") or "/")
    payload = "\n".join([timestamp, method, path, body])
    expected = hmac.new(_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat()


def _load_state():
    result = dynamodb.get_item(TableName=STATE_TABLE, Key={"pk": {"S": "control"}}, ConsistentRead=True)
    item = result.get("Item") or {}
    mode = (item.get("mode") or {}).get("S") or "normal"
    ttl = int((item.get("ttl") or {}).get("N") or "0")
    now = int(time.time())
    if mode == "forced_failover" and ttl and ttl <= now:
        dynamodb.delete_item(TableName=STATE_TABLE, Key={"pk": {"S": "control"}})
        item = {}
        mode = "normal"
        ttl = 0
    return {
        "mode": mode if mode == "forced_failover" else "normal",
        "drillId": (item.get("drillId") or {}).get("S"),
        "startedAt": (item.get("startedAt") or {}).get("S"),
        "expiresAt": _iso(ttl) if ttl else None,
    }


def _base_url(probe_url):
    parsed = urlsplit(probe_url)
    return urlunsplit((parsed.scheme, parsed.netloc, "", "", "")).rstrip("/")


def _probe(url, expected_origin=None):
    started = time.perf_counter()
    request = urllib.request.Request(
        url,
        method="GET",
        headers={
            "user-agent": "TheOutHaven-PlatformDR/1.0",
            "cache-control": "no-cache",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=PROBE_TIMEOUT_SECONDS) as response:
            body = response.read(64 * 1024)
            status = int(response.status)
            origin = response.headers.get("x-toh-platform-origin")
            revision = response.headers.get("x-toh-platform-revision")
            if not origin and "application/json" in (response.headers.get("content-type") or ""):
                try:
                    payload = json.loads(body.decode("utf-8"))
                    origin = payload.get("provider")
                    revision = payload.get("revision")
                except Exception:
                    pass
            healthy = 200 <= status < 500
            if expected_origin:
                healthy = healthy and origin == expected_origin
            return {
                "healthy": healthy,
                "status": status,
                "latencyMs": round((time.perf_counter() - started) * 1000),
                "origin": origin,
                "revision": revision,
                "url": url,
                "error": None,
            }
    except urllib.error.HTTPError as error:
        return {
            "healthy": False,
            "status": int(error.code),
            "latencyMs": round((time.perf_counter() - started) * 1000),
            "origin": error.headers.get("x-toh-platform-origin") if error.headers else None,
            "revision": error.headers.get("x-toh-platform-revision") if error.headers else None,
            "url": url,
            "error": f"http_{error.code}",
        }
    except Exception as error:
        return {
            "healthy": False,
            "status": None,
            "latencyMs": round((time.perf_counter() - started) * 1000),
            "origin": None,
            "revision": None,
            "url": url,
            "error": type(error).__name__,
        }


def _surface_probe(base, path):
    probe = _probe(f"{base}{path}")
    probe["healthy"] = bool(probe.get("status") and int(probe["status"]) < 500)
    return probe


def _compute_status():
    desired = running = pending = 0
    try:
        service = (ecs.describe_services(cluster=ECS_CLUSTER, services=[ECS_SERVICE]).get("services") or [None])[0]
        if service:
            desired = int(service.get("desiredCount") or 0)
            running = int(service.get("runningCount") or 0)
            pending = int(service.get("pendingCount") or 0)
    except Exception:
        pass

    healthy = unhealthy = 0
    try:
        for target in elbv2.describe_target_health(TargetGroupArn=TARGET_GROUP_ARN).get("TargetHealthDescriptions") or []:
            state = ((target.get("TargetHealth") or {}).get("State") or "unknown").lower()
            if state == "healthy":
                healthy += 1
            else:
                unhealthy += 1
    except Exception:
        pass

    return {
        "desiredTasks": desired,
        "runningTasks": running,
        "pendingTasks": pending,
        "healthyTargets": healthy,
        "unhealthyTargets": unhealthy,
    }


def _status():
    state = _load_state()
    primary = _probe(PRIMARY_PROBE_URL, "vercel")
    standby = _probe(STANDBY_PROBE_URL, "aws-dr")
    routed_probe = _probe(PUBLIC_PROBE_URL)
    primary_base = _base_url(PRIMARY_PROBE_URL)
    standby_base = _base_url(STANDBY_PROBE_URL)
    surfaces = []
    for key, label, path in SURFACES:
        surfaces.append({
            "key": key,
            "label": label,
            "path": path,
            "primary": _surface_probe(primary_base, path),
            "standby": _surface_probe(standby_base, path),
        })
    return {
        "ok": True,
        "configured": True,
        "environment": ENVIRONMENT,
        "state": state,
        "primary": primary,
        "standby": standby,
        "routedProbe": routed_probe,
        "compute": _compute_status(),
        "surfaces": surfaces,
    }


def _public_health():
    state = _load_state()
    if state["mode"] == "forced_failover":
        return _json_response(503, {
            "ok": False,
            "mode": state["mode"],
            "reason": "manual_drill_override",
        }, {"x-toh-dr-mode": "forced_failover"})

    primary = _probe(PRIMARY_PROBE_URL, "vercel")
    if primary["healthy"]:
        return _json_response(200, {
            "ok": True,
            "mode": "normal",
            "primary": {"healthy": True, "latencyMs": primary["latencyMs"], "revision": primary["revision"]},
        }, {"x-toh-dr-mode": "normal"})
    return _json_response(503, {
        "ok": False,
        "mode": "normal",
        "reason": "primary_probe_failed",
        "primary": {"healthy": False, "status": primary["status"], "error": primary["error"]},
    }, {"x-toh-dr-mode": "primary_failed"})


def _start_drill(payload):
    if str(payload.get("confirmation") or "") != LIVE_CONFIRMATION:
        raise ValueError("exact_live_failover_confirmation_required")
    try:
        duration = int(payload.get("durationSeconds") or 120)
    except (TypeError, ValueError):
        duration = 120
    duration = max(60, min(300, duration))

    readiness = _status()
    standby_ready = (
        readiness["standby"]["healthy"]
        and readiness["compute"]["runningTasks"] >= 1
        and readiness["compute"]["healthyTargets"] >= 1
        and all(surface["standby"]["healthy"] for surface in readiness["surfaces"])
    )
    if not standby_ready:
        raise RuntimeError("aws_standby_not_ready")

    now = int(time.time())
    drill_id = str(uuid.uuid4())
    item = {
        "pk": {"S": "control"},
        "mode": {"S": "forced_failover"},
        "drillId": {"S": drill_id},
        "startedAt": {"S": _iso(now)},
        "ttl": {"N": str(now + duration)},
    }
    dynamodb.put_item(TableName=STATE_TABLE, Item=item)
    return _status()


def _failback(payload):
    if str(payload.get("confirmation") or "") != LIVE_CONFIRMATION:
        raise ValueError("exact_live_failover_confirmation_required")
    dynamodb.delete_item(TableName=STATE_TABLE, Key={"pk": {"S": "control"}})
    return _status()


def handler(event, context):
    try:
        method = str(((event.get("requestContext") or {}).get("http") or {}).get("method") or "GET").upper()
        path = str(event.get("rawPath") or "/")
        body = _raw_body(event)

        if method == "GET" and path == "/v1/health/primary":
            return _public_health()

        if not _authorized(event, body):
            return _json_response(401, {"ok": False, "error": "unauthorized"})

        if method == "GET" and path == "/v1/status":
            return _json_response(200, _status())

        payload = json.loads(body or "{}")
        if method == "POST" and path == "/v1/drill/simulate":
            return _json_response(200, _status())
        if method == "POST" and path == "/v1/drill/start":
            return _json_response(200, _start_drill(payload))
        if method == "POST" and path == "/v1/drill/failback":
            return _json_response(200, _failback(payload))
        return _json_response(404, {"ok": False, "error": "not_found"})
    except ValueError as error:
        return _json_response(400, {"ok": False, "error": str(error)})
    except RuntimeError as error:
        return _json_response(409, {"ok": False, "error": str(error)})
    except Exception as error:
        print(json.dumps({
            "event": "platform_dr_gateway_error",
            "error": type(error).__name__,
            "requestId": getattr(context, "aws_request_id", None),
        }))
        return _json_response(500, {"ok": False, "error": "internal_error"})