import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

import boto3

GOOGLE_PLACES_SECRET_ARN = os.environ.get("GOOGLE_PLACES_SECRET_ARN", "")
GOOGLE_REQUEST_TIMEOUT_SECONDS = 8
GOOGLE_PHOTO_TIMEOUT_SECONDS = 12
MAX_GOOGLE_JSON_BYTES = 1_500_000
MAX_GOOGLE_PHOTO_BYTES = 4_000_000
GOOGLE_PLACE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,512}$")
GOOGLE_PHOTO_NAME_RE = re.compile(r"^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$")
GOOGLE_REGION_RE = re.compile(r"^[A-Z]{2}$")
GOOGLE_SESSION_TOKEN_RE = re.compile(r"^[A-Za-z0-9._~-]{1,256}$")
GOOGLE_METRIC_NAMESPACE = "TheOutHaven/GooglePlaces"

TEXT_SEARCH_IDS_ONLY_FIELD_MASK = "places.id"
TEXT_SEARCH_FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.rating",
    "places.userRatingCount",
    "places.businessStatus",
    "places.movedPlace",
    "places.movedPlaceId",
    "places.primaryType",
    "places.types",
    "places.photos",
    "places.googleMapsUri",
    "places.websiteUri",
])

AUTOCOMPLETE_FIELD_MASK = ",".join([
    "suggestions.placePrediction.placeId",
    "suggestions.placePrediction.text",
])

ADDRESS_DETAILS_FIELD_MASK = ",".join([
    "id",
    "formattedAddress",
    "addressComponents",
    "location",
])

DETAILS_FIELD_MASK = ",".join([
    "id",
    "displayName",
    "formattedAddress",
    "location",
    "nationalPhoneNumber",
    "internationalPhoneNumber",
    "websiteUri",
    "googleMapsUri",
    "rating",
    "userRatingCount",
    "businessStatus",
    "movedPlace",
    "movedPlaceId",
    "primaryType",
    "primaryTypeDisplayName",
    "types",
    "photos",
    "addressComponents",
    "currentOpeningHours",
    "currentSecondaryOpeningHours",
    "regularOpeningHours",
    "regularSecondaryOpeningHours",
    "utcOffsetMinutes",
    "timeZone",
    "priceLevel",
    "priceRange",
    "editorialSummary",
    "reservable",
    "outdoorSeating",
    "liveMusic",
    "goodForGroups",
    "goodForChildren",
    "menuForChildren",
    "goodForWatchingSports",
    "servesCocktails",
    "servesBeer",
    "servesWine",
    "servesBreakfast",
    "servesBrunch",
    "servesLunch",
    "servesDinner",
    "servesVegetarianFood",
    "servesDessert",
    "servesCoffee",
    "dineIn",
    "takeout",
    "delivery",
    "curbsidePickup",
    "allowsDogs",
    "restroom",
    "parkingOptions",
    "accessibilityOptions",
    "paymentOptions",
    "pureServiceAreaBusiness",
    "containingPlaces",
    "consumerAlert",
])
PHOTO_FIELD_MASK = "photos"

secrets = boto3.client("secretsmanager")
cloudwatch = boto3.client("cloudwatch")
_cached_google_places_secret = None


def _clean(value):
    return str(value or "").strip()


def load_google_places_secret():
    global _cached_google_places_secret
    if _cached_google_places_secret:
        return _cached_google_places_secret
    if not GOOGLE_PLACES_SECRET_ARN:
        raise RuntimeError("google_places_secret_not_configured")
    secret = _clean(
        secrets.get_secret_value(SecretId=GOOGLE_PLACES_SECRET_ARN).get("SecretString", "")
    )
    if len(secret) < 20 or secret == "__UNCONFIGURED_GOOGLE_PLACES__":
        raise RuntimeError("google_places_secret_invalid")
    _cached_google_places_secret = secret
    return secret


def _record_usage(sku, operation, *, session_token="", metadata=None):
    """Best-effort usage metering. Provider availability never depends on telemetry."""
    dimensions = [
        {"Name": "Sku", "Value": sku[:255]},
        {"Name": "Operation", "Value": operation[:255]},
    ]
    try:
        cloudwatch.put_metric_data(
            Namespace=GOOGLE_METRIC_NAMESPACE,
            MetricData=[{
                "MetricName": "Requests",
                "Dimensions": dimensions,
                "Value": 1.0,
                "Unit": "Count",
            }],
        )
    except Exception as exc:
        print(json.dumps({
            "level": "warning",
            "service": "integration-api",
            "provider": "google-places",
            "operation": "usage_metering",
            "sku": sku,
            "error": str(exc)[:300],
        }))
    print(json.dumps({
        "level": "info",
        "service": "integration-api",
        "provider": "google-places",
        "operation": operation,
        "sku": sku,
        "session_token_present": bool(_clean(session_token)),
        "metadata": metadata or {},
    }))


def _upstream_error(status, body_bytes):
    try:
        payload = json.loads(body_bytes.decode("utf-8", errors="replace") or "{}")
        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict) and error.get("message"):
                return str(error.get("message"))[:300]
    except json.JSONDecodeError:
        pass
    return f"Google Places request failed ({status})"


def _json_request(path, *, method="GET", field_mask, body=None, timeout=GOOGLE_REQUEST_TIMEOUT_SECONDS):
    url = f"https://places.googleapis.com/v1{path}"
    encoded_body = None
    headers = {
        "Accept": "application/json",
        "X-Goog-Api-Key": load_google_places_secret(),
        "X-Goog-FieldMask": field_mask,
        "User-Agent": "TheOutHaven/1.0",
    }
    if body is not None:
        encoded_body = json.dumps(body, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=encoded_body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as upstream:
            status = int(upstream.status)
            body_bytes = upstream.read(MAX_GOOGLE_JSON_BYTES + 1)
    except urllib.error.HTTPError as exc:
        body_bytes = exc.read(MAX_GOOGLE_JSON_BYTES + 1)
        raise RuntimeError(_upstream_error(exc.code, body_bytes)) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("Google Places is temporarily unavailable") from exc

    if status < 200 or status >= 300:
        raise RuntimeError(_upstream_error(status, body_bytes))
    if len(body_bytes) > MAX_GOOGLE_JSON_BYTES:
        raise RuntimeError("Google Places response was too large")
    try:
        payload = json.loads(body_bytes.decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise RuntimeError("Google Places returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Google Places returned an invalid response")
    return payload


def _place_id(payload):
    place_id = _clean(payload.get("placeId"))
    if not GOOGLE_PLACE_ID_RE.fullmatch(place_id):
        raise ValueError("invalid_google_place_id")
    return place_id


def _session_token(payload):
    token = _clean(payload.get("sessionToken"))
    if not token:
        return ""
    if not GOOGLE_SESSION_TOKEN_RE.fullmatch(token):
        raise ValueError("invalid_google_session_token")
    return token


def status():
    load_google_places_secret()
    return {"ok": True, "provider": "google-places", "credentialConfigured": True}


def search_text(payload):
    mode = _clean(payload.get("mode") or "text-search")
    if mode == "autocomplete":
        query = _clean(payload.get("input"))
        if not query:
            raise ValueError("google_autocomplete_input_required")
        if len(query) > 500:
            raise ValueError("google_autocomplete_input_too_long")
        token = _session_token(payload)
        body = {
            "input": query,
            "includedRegionCodes": ["us"],
        }
        if token:
            body["sessionToken"] = token
        result = _json_request(
            "/places:autocomplete",
            method="POST",
            field_mask=AUTOCOMPLETE_FIELD_MASK,
            body=body,
        )
        _record_usage(
            "autocomplete_requests",
            "autocomplete",
            session_token=token,
            metadata={"sessionTokenPresent": bool(token)},
        )
        suggestions = result.get("suggestions") if isinstance(result.get("suggestions"), list) else []
        return {"ok": True, "suggestions": suggestions}
    if mode != "text-search":
        raise ValueError("google_search_mode_invalid")

    query = _clean(payload.get("textQuery"))
    if not query:
        raise ValueError("google_text_query_required")
    if len(query) > 500:
        raise ValueError("google_text_query_too_long")
    try:
        page_size = int(payload.get("pageSize") or 20)
    except (TypeError, ValueError) as exc:
        raise ValueError("google_page_size_invalid") from exc
    page_size = max(1, min(20, page_size))
    region_code = _clean(payload.get("regionCode") or "US").upper()
    if not GOOGLE_REGION_RE.fullmatch(region_code):
        raise ValueError("google_region_code_invalid")
    field_mode = _clean(payload.get("fieldMode") or "rich").lower()
    if field_mode not in {"ids-only", "rich"}:
        raise ValueError("google_search_mode_invalid")
    field_mask = TEXT_SEARCH_IDS_ONLY_FIELD_MASK if field_mode == "ids-only" else TEXT_SEARCH_FIELD_MASK
    result = _json_request(
        "/places:searchText",
        method="POST",
        field_mask=field_mask,
        body={"textQuery": query, "pageSize": page_size, "regionCode": region_code},
    )
    _record_usage(
        "text_search_ids_only" if field_mode == "ids-only" else "text_search_enterprise",
        "text_search",
        metadata={"fieldMode": field_mode, "pageSize": page_size},
    )
    places = result.get("places") if isinstance(result.get("places"), list) else []
    return {"ok": True, "places": places}


def details(payload):
    place_id = _place_id(payload)
    token = _session_token(payload)
    field_mode = _clean(payload.get("fieldMode") or "rich").lower()
    if field_mode not in {"address", "rich"}:
        raise ValueError("google_details_field_mode_invalid")
    path = f"/places/{urllib.parse.quote(place_id, safe='')}"
    if token:
        path += "?" + urllib.parse.urlencode({"sessionToken": token})
    result = _json_request(
        path,
        field_mask=ADDRESS_DETAILS_FIELD_MASK if field_mode == "address" else DETAILS_FIELD_MASK,
    )
    _record_usage(
        "place_details_essentials" if field_mode == "address" else "place_details_enterprise_atmosphere",
        "place_details",
        session_token=token,
        metadata={"fieldMode": field_mode, "sessionTokenPresent": bool(token)},
    )
    return {"ok": True, "place": result}


def photo_metadata(payload):
    place_id = _place_id(payload)
    result = _json_request(
        f"/places/{urllib.parse.quote(place_id, safe='')}",
        field_mask=PHOTO_FIELD_MASK,
    )
    _record_usage("place_details_ids_only", "photo_metadata")
    photos = result.get("photos") if isinstance(result.get("photos"), list) else []
    return {"ok": True, "photos": photos}


def photo_media(payload):
    photo_name = _clean(payload.get("photoName")).lstrip("/")
    if not GOOGLE_PHOTO_NAME_RE.fullmatch(photo_name):
        raise ValueError("invalid_google_photo_name")
    try:
        max_width_px = int(payload.get("maxWidthPx") or 1200)
    except (TypeError, ValueError) as exc:
        raise ValueError("google_photo_width_invalid") from exc
    max_width_px = max(1, min(4800, max_width_px))
    query = urllib.parse.urlencode({"maxWidthPx": str(max_width_px)})
    url = f"https://places.googleapis.com/v1/{photo_name}/media?{query}"
    request = urllib.request.Request(
        url,
        method="GET",
        headers={
            "X-Goog-Api-Key": load_google_places_secret(),
            "User-Agent": "TheOutHaven/1.0",
            "Accept": "image/jpeg,image/webp,image/png;q=0.9,image/gif;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=GOOGLE_PHOTO_TIMEOUT_SECONDS) as upstream:
            status_code = int(upstream.status)
            content_type = _clean(upstream.headers.get("content-type")) or "application/octet-stream"
            body_bytes = upstream.read(MAX_GOOGLE_PHOTO_BYTES + 1)
    except urllib.error.HTTPError as exc:
        body_bytes = exc.read(MAX_GOOGLE_JSON_BYTES + 1)
        raise RuntimeError(_upstream_error(exc.code, body_bytes)) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("Google Places photo is temporarily unavailable") from exc

    if status_code < 200 or status_code >= 300:
        raise RuntimeError(_upstream_error(status_code, body_bytes))
    if len(body_bytes) > MAX_GOOGLE_PHOTO_BYTES:
        raise RuntimeError("Google Places photo response was too large")
    if not content_type.lower().startswith("image/"):
        raise RuntimeError("Google Places photo returned a non-image response")
    _record_usage("place_details_photos", "photo_media", metadata={"maxWidthPx": max_width_px})
    return {
        "status": status_code,
        "contentType": content_type,
        "bodyBytes": body_bytes,
    }
