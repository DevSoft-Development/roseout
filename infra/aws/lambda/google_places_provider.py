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

TEXT_SEARCH_FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.rating",
    "places.userRatingCount",
    "places.businessStatus",
    "places.primaryType",
    "places.types",
    "places.photos",
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
    "primaryType",
    "types",
    "photos",
    "addressComponents",
    "currentOpeningHours",
    "regularOpeningHours",
    "regularSecondaryOpeningHours",
    "utcOffsetMinutes",
    "priceLevel",
    "priceRange",
    "editorialSummary",
    "reservable",
    "outdoorSeating",
    "liveMusic",
    "goodForGroups",
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
])
PHOTO_FIELD_MASK = "photos"

secrets = boto3.client("secretsmanager")
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


def status():
    load_google_places_secret()
    return {"ok": True, "provider": "google-places", "credentialConfigured": True}


def search_text(payload):
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
    result = _json_request(
        "/places:searchText",
        method="POST",
        field_mask=TEXT_SEARCH_FIELD_MASK,
        body={"textQuery": query, "pageSize": page_size, "regionCode": region_code},
    )
    places = result.get("places") if isinstance(result.get("places"), list) else []
    return {"ok": True, "places": places}


def details(payload):
    place_id = _place_id(payload)
    result = _json_request(
        f"/places/{urllib.parse.quote(place_id, safe='')}",
        field_mask=DETAILS_FIELD_MASK,
    )
    return {"ok": True, "place": result}


def photo_metadata(payload):
    place_id = _place_id(payload)
    result = _json_request(
        f"/places/{urllib.parse.quote(place_id, safe='')}",
        field_mask=PHOTO_FIELD_MASK,
    )
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
    return {
        "status": status_code,
        "contentType": content_type,
        "bodyBytes": body_bytes,
    }
