import base64
import hashlib
import hmac
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import boto3

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SHARED_SECRET_ARN = os.environ.get("SHARED_SECRET_ARN", "")
SUPABASE_SERVICE_ROLE_SECRET_ID = os.environ.get("SUPABASE_SERVICE_ROLE_SECRET_ID", "")
MAX_CLOCK_SKEW_SECONDS = 300
MAX_REQUEST_BODY_BYTES = 64_000
SUPABASE_TIMEOUT_SECONDS = 8
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
CONTEXT_KEYS = (
    "accountId",
    "contactId",
    "locationId",
    "opportunityId",
    "claimId",
    "supportCaseId",
    "taskId",
)
PAGE_SIZES = {25, 50, 100}
BLOCKING_RUN_STATUSES = {"planned", "queued", "running"}
RESERVATION_DISCOVERY_EXHAUSTED = {"not_found", "no_website"}
HOURS_DISCOVERY_EXHAUSTED = {"website_no_hours"}
LOCATION_HEALTH_SELECT = (
    "id,name,address,city,state,market,location_type,phone,website,google_website_uri,"
    "operating_hours,hours_backfill_status,main_image,image_url,images,google_place_id,"
    "latitude,longitude,primary_category,cuisine,cuisine_type,activity_type,"
    "external_reservation_url,reservation_url,reservation_link,booking_url,"
    "reservation_discovery_status,search_keywords,semantic_tags,intent_tags,"
    "google_enriched_at,updated_at,is_searchable"
)

secrets = boto3.client("secretsmanager")
_secret_cache = {}


def response(status, payload):
    return {
        "statusCode": int(status),
        "headers": {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-toh-service": "core-api",
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
    secret = load_secret(SHARED_SECRET_ARN)
    expected = hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def parse_json(body):
    if len(body.encode("utf-8")) > MAX_REQUEST_BODY_BYTES:
        raise ValueError("request_too_large")
    try:
        value = json.loads(body or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("invalid_json") from exc
    if not isinstance(value, dict):
        raise ValueError("json_object_required")
    return value


def valid_uuid(value):
    return isinstance(value, str) and UUID_RE.fullmatch(value) is not None


def sanitize_context(raw):
    if not isinstance(raw, dict):
        raise ValueError("context_object_required")
    context = {}
    for key in CONTEXT_KEYS:
        value = raw.get(key)
        if value is None:
            continue
        if not valid_uuid(value):
            raise ValueError(f"invalid_{key}")
        context[key] = value
    return_to = raw.get("returnTo")
    if isinstance(return_to, str) and return_to.startswith("/admin/dashboard/crm") and not return_to.startswith("//"):
        context["returnTo"] = return_to[:2_000]
    return context


def supabase_rows(table, select, params=None, *, limit=None, offset=None, count=False):
    if not SUPABASE_URL.startswith("https://"):
        raise RuntimeError("supabase_url_not_configured")
    service_role = load_secret(SUPABASE_SERVICE_ROLE_SECRET_ID)
    query = [("select", select)]
    for key, value in params or []:
        query.append((key, str(value)))
    if offset is not None:
        query.append(("offset", str(max(0, int(offset)))))
    if limit is not None:
        query.append(("limit", str(max(0, int(limit)))))
    url = f"{SUPABASE_URL}/rest/v1/{table}?{urllib.parse.urlencode(query)}"
    headers = {
        "accept": "application/json",
        "apikey": service_role,
        "authorization": f"Bearer {service_role}",
    }
    if count:
        headers["prefer"] = "count=exact"
    request = urllib.request.Request(url, method="GET", headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=SUPABASE_TIMEOUT_SECONDS) as upstream:
            payload = json.loads(upstream.read().decode("utf-8") or "[]")
            content_range = upstream.headers.get("content-range", "")
    except urllib.error.HTTPError as exc:
        body = exc.read(1_500).decode("utf-8", errors="replace")
        raise RuntimeError(f"supabase_http_{exc.code}:{body}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("supabase_unavailable") from exc
    if not isinstance(payload, list):
        raise RuntimeError("supabase_response_invalid")
    total = None
    if count:
        try:
            total_token = content_range.rsplit("/", 1)[1]
            total = int(total_token) if total_token != "*" else None
        except (IndexError, TypeError, ValueError):
            total = None
    return payload, total


def supabase_get(table, select, filters):
    payload, _ = supabase_rows(table, select, filters, limit=1)
    return payload[0] if payload else None


def resolve_context(context):
    resolved = dict(context)
    if resolved.get("locationId") and not resolved.get("accountId"):
        relation = supabase_get(
            "crm_account_locations",
            "account_id",
            [("location_id", f"eq.{resolved['locationId']}"), ("status", "eq.active")],
        )
        if relation and valid_uuid(relation.get("account_id")):
            resolved["accountId"] = relation["account_id"]

    if resolved.get("opportunityId"):
        opportunity = supabase_get(
            "crm_opportunities",
            "account_id,primary_contact_id,primary_location_id",
            [("id", f"eq.{resolved['opportunityId']}")],
        )
        if opportunity:
            if not resolved.get("accountId") and valid_uuid(opportunity.get("account_id")):
                resolved["accountId"] = opportunity["account_id"]
            if not resolved.get("contactId") and valid_uuid(opportunity.get("primary_contact_id")):
                resolved["contactId"] = opportunity["primary_contact_id"]
            if not resolved.get("locationId") and valid_uuid(opportunity.get("primary_location_id")):
                resolved["locationId"] = opportunity["primary_location_id"]
    return resolved


def label_queries(context):
    queries = {
        "location": ("locations", "id,name,city,state", context.get("locationId")),
        "account": ("crm_accounts", "id,name", context.get("accountId")),
        "contact": ("crm_contacts", "id,full_name,email", context.get("contactId")),
        "opportunity": ("crm_opportunities", "id,name", context.get("opportunityId")),
    }

    def fetch(item):
        label, (table, select, record_id) = item
        if not record_id:
            return label, None
        return label, supabase_get(table, select, [("id", f"eq.{record_id}")])

    with ThreadPoolExecutor(max_workers=4) as pool:
        return dict(pool.map(fetch, queries.items()))


def crm_context(payload):
    context = sanitize_context(payload.get("context") or {})
    resolved = resolve_context(context)
    labels = label_queries(resolved)
    return response(200, {"context": resolved, "labels": labels})


def text(value):
    return str(value or "").strip()


def has_reservation_link(row):
    return bool(text(
        row.get("external_reservation_url")
        or row.get("reservation_url")
        or row.get("reservation_link")
        or row.get("booking_url")
    ))


def reservation_discovery_exhausted(row):
    return text(row.get("reservation_discovery_status")).lower() in RESERVATION_DISCOVERY_EXHAUSTED


def hours_discovery_exhausted(row):
    return text(row.get("hours_backfill_status")).lower() in HOURS_DISCOVERY_EXHAUSTED


def missing_operating_hours(row):
    value = row.get("operating_hours")
    return value is None or (isinstance(value, dict) and len(value) == 0)


def timestamp_ms(value):
    if not value:
        return 0
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return int(parsed.timestamp() * 1000)
    except (TypeError, ValueError):
        return 0


def issues_for(row):
    issues = []
    if not text(row.get("google_place_id")):
        issues.append("Missing trusted business match")
    if missing_operating_hours(row) and not hours_discovery_exhausted(row):
        issues.append("Hours missing")
    images = row.get("images")
    if not text(row.get("main_image")) and not text(row.get("image_url")) and (not isinstance(images, list) or not images):
        issues.append("Photo missing")
    if not text(row.get("website")) and not text(row.get("google_website_uri")):
        issues.append("Website missing")
    if not text(row.get("phone")):
        issues.append("Phone missing")
    if not text(
        row.get("primary_category")
        or row.get("cuisine")
        or row.get("cuisine_type")
        or row.get("activity_type")
    ):
        issues.append("Category missing")
    if not has_reservation_link(row) and not reservation_discovery_exhausted(row):
        issues.append("Reservation link missing")
    if row.get("latitude") is None or row.get("longitude") is None:
        issues.append("Map location incomplete")
    if (
        not isinstance(row.get("search_keywords"), list)
        or not row.get("search_keywords")
        or not isinstance(row.get("semantic_tags"), list)
        or not row.get("semantic_tags")
        or not isinstance(row.get("intent_tags"), list)
        or not row.get("intent_tags")
    ):
        issues.append("Search details need improvement")
    enriched_at = timestamp_ms(row.get("google_enriched_at"))
    ninety_days_ago_ms = int((time.time() - (90 * 86400)) * 1000)
    if not enriched_at or enriched_at < ninety_days_ago_ms:
        issues.append("Information needs refreshing")
    return issues


def health_score(issue_count):
    return max(20, 100 - min(10, int(issue_count)) * 8)


def is_crm_location_health_run(run):
    settings = run.get("settings")
    return isinstance(settings, dict) and settings.get("createdFrom") == "crm-location-health"


def sanitize_location_health_input(payload):
    try:
        page = max(1, int(payload.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        requested_page_size = int(payload.get("pageSize") or 50)
    except (TypeError, ValueError):
        requested_page_size = 50
    page_size = requested_page_size if requested_page_size in PAGE_SIZES else 50
    q = text(payload.get("q"))[:200]
    view = text(payload.get("view") or "attention").lower()
    if view not in {"attention", "refresh", "repair"}:
        view = "attention"
    return page, page_size, q, view


def location_health(payload):
    page, page_size, q, view = sanitize_location_health_input(payload)
    start = (page - 1) * page_size

    location_params = []
    if q:
        clean_q = re.sub(r"[%_,]", " ", q)
        location_params.append((
            "or",
            f"(name.ilike.%{clean_q}%,city.ilike.%{clean_q}%,address.ilike.%{clean_q}%)",
        ))

    if view == "refresh":
        cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat().replace("+00:00", "Z")
        location_params.append(("or", f"(google_enriched_at.is.null,google_enriched_at.lt.{cutoff})"))
    elif view == "repair":
        location_params.append(("or", "(google_place_id.is.null,latitude.is.null,longitude.is.null,is_searchable.eq.false)"))
    else:
        location_params.append((
            "or",
            "(google_place_id.is.null,phone.is.null,website.is.null,operating_hours.is.null,"
            "main_image.is.null,latitude.is.null,longitude.is.null)",
        ))
    location_params.append(("order", "updated_at.desc.nullslast"))

    def fetch_locations():
        return supabase_rows(
            "locations",
            LOCATION_HEALTH_SELECT,
            location_params,
            limit=page_size,
            offset=start,
            count=True,
        )

    def fetch_duplicate_count():
        _, total = supabase_rows(
            "location_duplicate_review",
            "id",
            [("status", "eq.pending")],
            limit=1,
            count=True,
        )
        return total or 0

    def fetch_runs():
        rows, _ = supabase_rows(
            "location_enrichment_runs",
            "*",
            [("order", "created_at.desc")],
            limit=25,
        )
        return rows

    with ThreadPoolExecutor(max_workers=3) as pool:
        locations_future = pool.submit(fetch_locations)
        duplicates_future = pool.submit(fetch_duplicate_count)
        runs_future = pool.submit(fetch_runs)
        location_rows, total = locations_future.result()
        duplicate_count = duplicates_future.result()
        runs = runs_future.result()

    rows = []
    for row in location_rows:
        enriched = dict(row)
        issues = issues_for(row)
        enriched["issues"] = issues
        enriched["healthScore"] = health_score(len(issues))
        rows.append(enriched)

    crm_runs = [run for run in runs if is_crm_location_health_run(run)]
    active_run = next(
        (run for run in crm_runs if text(run.get("status")) in BLOCKING_RUN_STATUSES),
        None,
    )
    latest_run = crm_runs[0] if crm_runs else None
    results_run = active_run or latest_run

    review_items = []
    owner_update_count = 0
    try:
        review_records = int((results_run or {}).get("review_records") or 0)
    except (TypeError, ValueError):
        review_records = 0

    if results_run and results_run.get("id") and review_records > 0:
        review_rows, _ = supabase_rows(
            "location_enrichment_run_items",
            "location_id,reasons,last_error,match_diagnostics",
            [
                ("run_id", f"eq.{results_run['id']}"),
                ("status", "eq.review"),
                ("order", "priority.asc.nullslast"),
            ],
            limit=100,
        )
        location_ids = []
        seen = set()
        for item in review_rows:
            location_id = text(item.get("location_id"))
            if location_id and location_id not in seen:
                seen.add(location_id)
                location_ids.append(location_id)

        locations = {}
        if location_ids:
            details_rows, _ = supabase_rows(
                "locations",
                "id,name,operating_hours,hours_backfill_status,external_reservation_url,"
                "reservation_url,reservation_link,booking_url,reservation_discovery_status",
                [("id", f"in.({','.join(location_ids)})")],
                limit=len(location_ids),
            )
            locations = {text(row.get("id")): row for row in details_rows}

        for item in review_rows:
            location_id = text(item.get("location_id"))
            location = locations.get(location_id, {})
            raw_reasons = [text(value) for value in item.get("reasons", []) if text(value)] if isinstance(item.get("reasons"), list) else []
            owner_must_supply_reservation = (
                "missing_reservation" in raw_reasons
                and not has_reservation_link(location)
                and reservation_discovery_exhausted(location)
            )
            owner_must_supply_hours = (
                "missing_hours" in raw_reasons
                and missing_operating_hours(location)
                and hours_discovery_exhausted(location)
            )
            reasons = list(raw_reasons)
            if owner_must_supply_reservation:
                reasons = [reason for reason in reasons if reason != "missing_reservation"]
            if owner_must_supply_hours:
                reasons = [reason for reason in reasons if reason != "missing_hours"]
            if owner_must_supply_reservation or owner_must_supply_hours:
                owner_update_count += 1
            if not reasons:
                continue
            diagnostics = item.get("match_diagnostics")
            changed_fields = []
            if isinstance(diagnostics, dict) and isinstance(diagnostics.get("changedFields"), list):
                changed_fields = [text(value) for value in diagnostics["changedFields"] if text(value)]
            review_items.append({
                "locationId": location_id,
                "name": text(location.get("name")) or "Unnamed location",
                "reasons": reasons,
                "changedFields": changed_fields,
                "lastError": text(item.get("last_error")) or None,
            })

    visible_active_run = dict(active_run) if active_run else None
    visible_latest_run = dict(latest_run) if latest_run else None
    if visible_active_run is not None:
        visible_active_run["review_records"] = len(review_items)
    if visible_latest_run is not None:
        visible_latest_run["review_records"] = len(review_items)

    total = total or 0
    return response(200, {
        "success": True,
        "rows": rows,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "totalPages": max(1, (total + page_size - 1) // page_size),
        "duplicateCount": duplicate_count,
        "activeRun": visible_active_run,
        "latestRun": visible_latest_run,
        "reviewItems": review_items,
        "ownerUpdateCount": owner_update_count,
    })


def handler(event, context):
    body = raw_body(event)
    try:
        if not authenticate(event, body):
            return response(401, {"ok": False, "error": "unauthorized"})
    except Exception:
        return response(503, {"ok": False, "error": "core_api_auth_unavailable"})

    method = request_method(event)
    path = request_path(event)
    if method == "GET" and path == "/v1/status":
        return response(200, {
            "ok": True,
            "service": "theouthaven-core-api",
            "environment": ENVIRONMENT,
            "operations": ["crm.context", "crm.location_health.read"],
        })
    if method == "POST" and path == "/v1/crm/context":
        try:
            return crm_context(parse_json(body))
        except ValueError as exc:
            return response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return response(500, {"ok": False, "error": "crm_context_resolution_failed"})
    if method == "POST" and path == "/v1/crm/location-health/read":
        try:
            return location_health(parse_json(body))
        except ValueError as exc:
            return response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return response(500, {"ok": False, "error": "crm_location_health_read_failed"})
    return response(404, {"ok": False, "error": "not_found"})
