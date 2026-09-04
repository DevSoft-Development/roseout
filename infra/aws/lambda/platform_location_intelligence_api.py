import base64
from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

import boto3

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SHARED_SECRET_ARN = os.environ.get("SHARED_SECRET_ARN", "")
SUPABASE_SERVICE_ROLE_SECRET_ID = os.environ.get("SUPABASE_SERVICE_ROLE_SECRET_ID", "")
GOOGLE_METRIC_NAMESPACE = os.environ.get("GOOGLE_METRIC_NAMESPACE", "TheOutHaven/GooglePlaces")
MAX_CLOCK_SKEW_SECONDS = 300
MAX_REQUEST_BODY_BYTES = 64_000
SUPABASE_TIMEOUT_SECONDS = 8
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
MONTH_RE = re.compile(r"^\d{4}-\d{2}$")

DEFAULT_GOOGLE_BUDGET = {
    "targetUsd": 175.0,
    "softCapUsd": 190.0,
    "hardCapUsd": 200.0,
    "creditBalanceUsd": 300.0,
    "openingSpendUsd": 0.0,
    "openingSpendMonth": None,
    "enabled": True,
}

GOOGLE_SKUS = {
    "autocomplete_requests": {
        "operation": "autocomplete",
        "label": "Address autocomplete",
        "freeCap": 10000,
        "pricePer1000": 2.83,
    },
    "place_details_essentials": {
        "operation": "place_details",
        "label": "Address details",
        "freeCap": 10000,
        "pricePer1000": 5.0,
    },
    "place_details_enterprise_atmosphere": {
        "operation": "place_details",
        "label": "Rich location details",
        "freeCap": 1000,
        "pricePer1000": 25.0,
    },
    "place_details_photos": {
        "operation": "photo_media",
        "label": "Profile photo media",
        "freeCap": 1000,
        "pricePer1000": 7.0,
    },
    "text_search_enterprise": {
        "operation": "text_search",
        "label": "Rich text search",
        "freeCap": 1000,
        "pricePer1000": 35.0,
    },
    "text_search_ids_only": {
        "operation": "text_search",
        "label": "ID-only discovery",
        "freeCap": None,
        "pricePer1000": 0.0,
    },
    "place_details_ids_only": {
        "operation": "photo_metadata",
        "label": "Photo metadata",
        "freeCap": None,
        "pricePer1000": 0.0,
    },
}

secrets = boto3.client("secretsmanager")
cloudwatch = boto3.client("cloudwatch")
_secret_cache = {}


def response(status, payload):
    return {
        "statusCode": int(status),
        "headers": {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-toh-service": "location-intelligence-api",
        },
        "body": json.dumps(payload),
    }


def load_secret(secret_id):
    if not secret_id:
        raise RuntimeError("secret_not_configured")
    cached = _secret_cache.get(secret_id)
    if cached:
        return cached
    value = secrets.get_secret_value(SecretId=secret_id).get("SecretString", "")
    if not value:
        raise RuntimeError("secret_empty")
    _secret_cache[secret_id] = value
    return value


def raw_body(event):
    value = event.get("body") or ""
    if event.get("isBase64Encoded"):
        return base64.b64decode(value).decode("utf-8")
    return value


def request_method(event):
    return str(((event.get("requestContext") or {}).get("http") or {}).get("method") or "GET").upper()


def request_path(event):
    return str(event.get("rawPath") or event.get("path") or "/")


def authenticate(event, body):
    headers = {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}
    timestamp = headers.get("x-toh-timestamp", "")
    signature = headers.get("x-toh-signature", "")
    try:
        epoch_ms = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs((time.time() * 1000) - epoch_ms) > MAX_CLOCK_SKEW_SECONDS * 1000:
        return False
    canonical = "\n".join([timestamp, request_method(event), request_path(event), body])
    expected = hmac.new(load_secret(SHARED_SECRET_ARN).encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def parse_json(body):
    if len(body.encode("utf-8")) > MAX_REQUEST_BODY_BYTES:
        raise ValueError("request_too_large")
    try:
        payload = json.loads(body or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("invalid_json") from exc
    if not isinstance(payload, dict):
        raise ValueError("json_object_required")
    return payload


def _supabase_request(path, params=None):
    if not SUPABASE_URL.startswith("https://"):
        raise RuntimeError("supabase_url_not_configured")
    service_role = load_secret(SUPABASE_SERVICE_ROLE_SECRET_ID)
    query = urllib.parse.urlencode(params or {}, doseq=True)
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if query:
        url += "?" + query
    request = urllib.request.Request(
        url,
        method="GET",
        headers={
            "accept": "application/json",
            "apikey": service_role,
            "authorization": f"Bearer {service_role}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=SUPABASE_TIMEOUT_SECONDS) as upstream:
            raw = upstream.read().decode("utf-8") or "[]"
    except urllib.error.HTTPError as exc:
        detail = exc.read(3000).decode("utf-8", errors="replace")
        raise RuntimeError(f"supabase_http_{exc.code}:{detail}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("supabase_unavailable") from exc
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("supabase_invalid_json") from exc


def _number(value, fallback):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed >= 0 else fallback


def _month(value):
    normalized = str(value or "").strip()
    return normalized if MONTH_RE.fullmatch(normalized) else None


def load_google_budget():
    rows = _supabase_request("app_settings", {
        "select": "value,updated_at,updated_by",
        "key": "eq.google_places_budget",
        "limit": "1",
    })
    row = rows[0] if isinstance(rows, list) and rows else {}
    raw = row.get("value") if isinstance(row, dict) and isinstance(row.get("value"), dict) else {}
    settings = {
        "targetUsd": _number(raw.get("targetUsd"), DEFAULT_GOOGLE_BUDGET["targetUsd"]),
        "softCapUsd": _number(raw.get("softCapUsd"), DEFAULT_GOOGLE_BUDGET["softCapUsd"]),
        "hardCapUsd": _number(raw.get("hardCapUsd"), DEFAULT_GOOGLE_BUDGET["hardCapUsd"]),
        "creditBalanceUsd": _number(raw.get("creditBalanceUsd"), DEFAULT_GOOGLE_BUDGET["creditBalanceUsd"]),
        "openingSpendUsd": _number(raw.get("openingSpendUsd"), DEFAULT_GOOGLE_BUDGET["openingSpendUsd"]),
        "openingSpendMonth": _month(raw.get("openingSpendMonth")),
        "enabled": raw.get("enabled") is not False,
        "updatedAt": row.get("updated_at") if isinstance(row, dict) else None,
    }
    if settings["softCapUsd"] > settings["hardCapUsd"]:
        settings["softCapUsd"] = settings["hardCapUsd"]
    if settings["targetUsd"] > settings["softCapUsd"]:
        settings["targetUsd"] = settings["softCapUsd"]
    return settings


def _month_bounds():
    now = datetime.now(timezone.utc)
    start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    return start, now


def google_metric_counts():
    start, end = _month_bounds()
    queries = []
    for index, (sku, config) in enumerate(GOOGLE_SKUS.items()):
        queries.append({
            "Id": f"m{index}",
            "Label": sku,
            "MetricStat": {
                "Metric": {
                    "Namespace": GOOGLE_METRIC_NAMESPACE,
                    "MetricName": "Requests",
                    "Dimensions": [
                        {"Name": "Sku", "Value": sku},
                        {"Name": "Operation", "Value": config["operation"]},
                    ],
                },
                "Period": 3600,
                "Stat": "Sum",
                "Unit": "Count",
            },
            "ReturnData": True,
        })
    result = cloudwatch.get_metric_data(
        MetricDataQueries=queries,
        StartTime=start,
        EndTime=end,
        ScanBy="TimestampAscending",
    )
    counts = {sku: 0 for sku in GOOGLE_SKUS}
    for metric in result.get("MetricDataResults", []):
        label = metric.get("Label")
        if label in counts:
            counts[label] = int(round(sum(float(value) for value in metric.get("Values", []))))
    return counts, start.date().isoformat(), end.isoformat()


def google_budget_summary():
    settings = load_google_budget()
    counts, month, measured_at = google_metric_counts()
    items = []
    metered_spend = 0.0
    for sku, config in GOOGLE_SKUS.items():
        count = counts.get(sku, 0)
        free_cap = config["freeCap"]
        billable = 0 if free_cap is None else max(0, count - int(free_cap))
        cost = round((billable / 1000.0) * float(config["pricePer1000"]), 4)
        metered_spend += cost
        items.append({
            "sku": sku,
            "label": config["label"],
            "requests": count,
            "freeCap": free_cap,
            "billableRequests": billable,
            "pricePer1000": config["pricePer1000"],
            "estimatedCostUsd": cost,
        })
    current_month = month[:7]
    opening_spend_applied = settings["openingSpendUsd"] if settings["openingSpendMonth"] == current_month else 0.0
    gross_spend = round(opening_spend_applied + metered_spend, 2)
    hard_cap = settings["hardCapUsd"]
    soft_cap = settings["softCapUsd"]
    target = settings["targetUsd"]
    if not settings["enabled"]:
        mode = "disabled"
    elif gross_spend >= hard_cap:
        mode = "stop_optional_paid_google"
    elif gross_spend >= soft_cap:
        mode = "critical_only"
    elif gross_spend >= target:
        mode = "reduce_low_priority"
    else:
        mode = "normal"
    return {
        "ok": True,
        "service": "location-intelligence-api",
        "month": month,
        "measuredAt": measured_at,
        "pricingSnapshot": "2026-09-01",
        "settings": settings,
        "openingSpendAppliedUsd": round(opening_spend_applied, 2),
        "meteredSpendUsd": round(metered_spend, 2),
        "estimatedSpendUsd": gross_spend,
        "budgetRemainingUsd": round(max(0.0, hard_cap - gross_spend), 2),
        "targetRemainingUsd": round(max(0.0, target - gross_spend), 2),
        "estimatedCreditsRemainingUsd": round(max(0.0, settings["creditBalanceUsd"] - gross_spend), 2),
        "percentOfHardCapUsed": round((gross_spend / hard_cap) * 100.0, 1) if hard_cap > 0 else 0.0,
        "operatingMode": mode,
        "optionalPaidWorkAllowed": bool(settings["enabled"] and gross_spend < hard_cap),
        "usage": items,
        "notes": [
            "Spend is TheOutHaven's metered estimate; Google Cloud Billing remains authoritative.",
            "Autocomplete totals are conservatively counted as requests; valid sessions can reduce actual billable autocomplete usage after the session-pricing threshold.",
            "Opening spend is applied only to the configured billing month and never carries into a later month.",
        ],
    }


def _location_row(location_id):
    rows = _supabase_request("locations", {
        "select": "id,name,business_name,restaurant_name,activity_name,address,formatted_address,city,state,latitude,longitude,is_searchable,is_hidden,active,deleted_at,is_low_level,low_level_reason,duplicate_status,duplicate_of,quality_status,publish_ready,enrichment_status,google_enrichment_status,google_place_id,place_id,website,website_url,google_website_uri,rating,google_rating,review_count,google_user_rating_count,google_primary_type,google_types,operating_hours,google_regular_opening_hours,google_current_opening_hours,hours,is_claimed,claimed,owner_user_id,claim_status",
        "id": f"eq.{location_id}",
        "limit": "1",
    })
    return rows[0] if isinstance(rows, list) and rows else None


def _has_profile(location_id):
    rows = _supabase_request("location_search_profiles", {
        "select": "location_id,primary_domain,confidence,needs_review,profile_version,taxonomy_version",
        "location_id": f"eq.{location_id}",
        "limit": "1",
    })
    return rows[0] if isinstance(rows, list) and rows else None


def _present(value):
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return len(value) > 0
    return True


def evaluate_readiness(payload):
    location_id = str(payload.get("locationId") or "").strip()
    if not UUID_RE.fullmatch(location_id):
        raise ValueError("invalid_location_id")
    row = _location_row(location_id)
    if not row:
        return response(404, {"ok": False, "error": "location_not_found"})
    profile = _has_profile(location_id)
    blockers = []
    warnings = []
    if row.get("deleted_at"):
        blockers.append("deleted")
    if row.get("is_hidden") is True:
        blockers.append("hidden")
    if row.get("active") is False:
        blockers.append("inactive")
    duplicate_status = str(row.get("duplicate_status") or "").lower()
    if duplicate_status == "duplicate" or row.get("duplicate_of"):
        blockers.append("confirmed_duplicate")
    elif duplicate_status in {"", "unknown", "possible_duplicate"}:
        blockers.append("dedupe_unresolved")
    if row.get("is_low_level") is True:
        blockers.append("low_level")
        warnings.append(f"low_level_reason:{str(row.get('low_level_reason') or 'unspecified')}")
    name = row.get("name") or row.get("business_name") or row.get("restaurant_name") or row.get("activity_name")
    if not _present(name):
        blockers.append("missing_name")
    if not _present(row.get("address") or row.get("formatted_address")):
        blockers.append("missing_address")
    if row.get("latitude") is None or row.get("longitude") is None:
        blockers.append("missing_coordinates")
    if not profile:
        blockers.append("missing_search_profile")
    if not _present(row.get("google_place_id") or row.get("place_id")):
        warnings.append("missing_google_place_id")
    if not _present(row.get("website") or row.get("website_url") or row.get("google_website_uri")):
        warnings.append("missing_website")
    if row.get("rating") is None and row.get("google_rating") is None:
        warnings.append("missing_rating")
    if row.get("review_count") is None and row.get("google_user_rating_count") is None:
        warnings.append("missing_rating_count")
    if not _present(row.get("google_primary_type")) and not _present(row.get("google_types")):
        warnings.append("missing_google_type")
    if not any(_present(row.get(field)) for field in ("operating_hours", "google_regular_opening_hours", "google_current_opening_hours", "hours")):
        warnings.append("missing_hours")
    claimed = bool(row.get("is_claimed") or row.get("claimed") or row.get("owner_user_id") or row.get("claim_status") == "approved")
    return response(200, {
        "ok": True,
        "locationId": location_id,
        "currentSearchable": row.get("is_searchable") is True,
        "recommendedSearchable": len(blockers) == 0,
        "blockers": blockers,
        "warnings": warnings,
        "claimed": claimed,
        "routineGoogleRefreshAllowed": not claimed,
        "profile": profile,
    })


def handler(event, context):
    try:
        body = raw_body(event)
        path = request_path(event)
        method = request_method(event)
        if not authenticate(event, body):
            return response(401, {"ok": False, "error": "unauthorized"})
        if method == "GET" and path == "/healthz":
            return response(200, {"ok": True, "service": "location-intelligence-api", "environment": ENVIRONMENT})
        if method == "GET" and path == "/v1/google-budget/summary":
            return response(200, google_budget_summary())
        payload = parse_json(body)
        if method == "POST" and path == "/v1/location/readiness":
            return evaluate_readiness(payload)
        return response(404, {"ok": False, "error": "not_found"})
    except ValueError as exc:
        return response(400, {"ok": False, "error": str(exc)})
    except Exception as exc:
        print(json.dumps({
            "level": "error",
            "service": "location-intelligence-api",
            "error": str(exc)[:1000],
        }))
        return response(500, {"ok": False, "error": "location_intelligence_unavailable"})
