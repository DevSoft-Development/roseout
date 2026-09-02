import json
import math
import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import base_core as core

VALID_RANGES = {"7d": 7, "30d": 30, "90d": 90, "12m": 365, "all": None}
PROFILE_VIEW_EVENTS = {"profile_view", "location_profile_view", "profile_viewed"}
SEARCH_APPEARANCE_EVENTS = {"search_appearance", "location_impression", "search_match"}
SEARCH_CLICK_EVENTS = {"search_click", "location_click", "restaurant_click", "activity_click"}
RESERVE_CLICK_EVENTS = {
    "reserve_clicked",
    "reservation_clicked",
    "external_reservation_clicked",
    "reservation_started",
    "outing_reservation_clicked",
}
DIRECTIONS_EVENTS = {"directions_click", "outing_directions_clicked"}
PHONE_EVENTS = {"phone_click", "phone_clicked", "outing_phone_clicked"}
WEBSITE_EVENTS = {"website_click", "outing_website_clicked"}
CALL_EVENTS = {"call_clicked", "phone_click", "phone_clicked", "outing_phone_clicked"}
SAVE_EVENTS = {"plan_saved", "guest_plan_saved", "outing_plan_created", "guest_plan_created"}
START_EVENTS = {"outing_started", *SAVE_EVENTS}
ACTION_EVENTS = {
    "reserve_clicked",
    "call_clicked",
    "reservation_started",
    "phone_click",
    "outing_reservation_clicked",
    "outing_phone_clicked",
}
MOST_SEARCHED_EVENTS = {"search_click", "search_match", "location_impression"}


def metadata(row):
    value = row.get("metadata")
    return value if isinstance(value, dict) else {}


def safe_number(value):
    try:
        if value is None:
            return 0.0
        if isinstance(value, bool):
            return 1.0 if value else 0.0
        number = float(value)
        return number if math.isfinite(number) else 0.0
    except (TypeError, ValueError):
        return 0.0


def pct(numerator, denominator):
    return numerator / denominator if denominator > 0 else 0.0


def average(values):
    filtered = [safe_number(value) for value in values]
    filtered = [value for value in filtered if value > 0]
    return sum(filtered) / len(filtered) if filtered else 0.0


def range_start(range_name):
    days = VALID_RANGES[range_name]
    if days is None:
        return None
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat().replace("+00:00", "Z")


def normalize_event_name(row):
    meta = metadata(row)
    value = (
        row.get("event_name")
        or row.get("event_type")
        or meta.get("event_name")
        or meta.get("event_type")
        or ""
    )
    return str(value).strip().lower()


def event_location_id(row):
    return row.get("location_id") or metadata(row).get("location_id") or None


def outing_location_id(row):
    return row.get("location_id") or row.get("source_location_id") or None


def normalize_category(value):
    text = str(value if value is not None else "").strip()
    if not text or text == "[]":
        return "Unknown"
    if text.startswith("[") and text.endswith("]"):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                text = str(parsed[0] if parsed else "")
        except (json.JSONDecodeError, TypeError):
            pass
    text = re.sub(r'[\[\]"]', "", text).strip()
    key = text.lower()
    mapped = {
        "brunch spots": "Brunch",
        "brunch": "Brunch",
        "hookah lounge": "Hookah Lounge",
        "cafe": "Café",
        "seafood restaurant": "Seafood",
        "steakhouse": "Steakhouse",
        "theouthaven-friendly outing": "Unknown",
    }.get(key)
    if mapped:
        return mapped
    if not text:
        return "Unknown"
    return re.sub(r"\b\w", lambda match: match.group(0).upper(), text)


def location_display_name(row):
    return row.get("name") or row.get("restaurant_name") or row.get("activity_name") or "Untitled location"


def location_category(row):
    return normalize_category(
        row.get("primary_category")
        or row.get("category")
        or row.get("cuisine")
        or row.get("cuisine_type")
        or row.get("activity_type")
        or row.get("location_type")
        or "Unknown"
    )


def location_type(row):
    return str(row.get("location_type") or ("activity" if row.get("activity_type") else "restaurant"))


def build_summary(events, outings):
    names = [normalize_event_name(event) for event in events]
    completed = [
        outing for outing in outings
        if outing.get("status") == "completed" or outing.get("completed_at") or outing.get("attendance_confirmed_at")
    ]
    completed_no_feedback = [
        outing for outing in outings
        if outing.get("status") == "completed_no_feedback" or outing.get("completed_no_feedback_at")
    ]
    saved_plans = max(
        sum(1 for name in names if name in SAVE_EVENTS),
        sum(1 for outing in outings if outing.get("saved_at")),
    )
    starts = max(sum(1 for name in names if name in START_EVENTS), saved_plans)
    outbound_clicks = sum(1 for name in names if name.startswith("outing_") and name.endswith("_clicked"))
    profile_views = sum(1 for name in names if name in PROFILE_VIEW_EVENTS)
    search_events = sum(1 for name in names if "search" in name)
    action_events = sum(1 for name in names if name in ACTION_EVENTS)
    completed_total = len(completed) + len(completed_no_feedback)

    return {
        "profile_views": profile_views,
        "search_appearances": sum(1 for name in names if name in SEARCH_APPEARANCE_EVENTS),
        "search_clicks": sum(1 for name in names if name in SEARCH_CLICK_EVENTS),
        "reserve_clicks": sum(1 for name in names if name in RESERVE_CLICK_EVENTS),
        "directions_clicks": sum(1 for name in names if name in DIRECTIONS_EVENTS),
        "phone_clicks": sum(1 for name in names if name in PHONE_EVENTS),
        "website_clicks": sum(1 for name in names if name in WEBSITE_EVENTS),
        "call_clicks": sum(1 for name in names if name in CALL_EVENTS),
        "saved_plans": saved_plans,
        "outbound_clicks": outbound_clicks,
        "completion_signals": completed_total,
        "outing_starts": starts,
        "completed_outings": completed_total,
        "average_rating": average([outing.get("rating") for outing in completed]),
        "matched_vibe_percentage": pct(sum(1 for outing in completed if outing.get("matched_vibe") is True), len(completed)),
        "would_go_again_percentage": pct(sum(1 for outing in completed if outing.get("would_go_again") is True), len(completed)),
        "plan_conversion_rate": pct(saved_plans, search_events),
        "link_click_rate": pct(outbound_clicks, saved_plans),
        "completion_rate": pct(completed_total, starts),
        "action_rate": pct(action_events, profile_views),
    }


def build_daily_series(events):
    rows = {}
    for event in events:
        created_at = str(event.get("created_at") or "")
        day = created_at[:10] or "Unknown"
        name = normalize_event_name(event)
        row = rows.setdefault(day, {
            "date": day,
            "events": 0,
            "profile_views": 0,
            "search_appearances": 0,
            "search_clicks": 0,
            "reserve_clicks": 0,
            "directions_clicks": 0,
            "phone_clicks": 0,
            "website_clicks": 0,
            "call_clicks": 0,
        })
        row["events"] += 1
        if name in PROFILE_VIEW_EVENTS:
            row["profile_views"] += 1
        if name in SEARCH_APPEARANCE_EVENTS:
            row["search_appearances"] += 1
        if name in SEARCH_CLICK_EVENTS:
            row["search_clicks"] += 1
        if name in RESERVE_CLICK_EVENTS:
            row["reserve_clicks"] += 1
        if name in DIRECTIONS_EVENTS:
            row["directions_clicks"] += 1
        if name in PHONE_EVENTS:
            row["phone_clicks"] += 1
            row["call_clicks"] += 1
        if name == "call_clicked":
            row["call_clicks"] += 1
        if name in WEBSITE_EVENTS:
            row["website_clicks"] += 1
    return sorted(rows.values(), key=lambda row: str(row["date"]))


def build_location_rollups(locations, events, outings):
    events_by_location = defaultdict(list)
    outings_by_location = defaultdict(list)
    for event in events:
        location_id = event_location_id(event)
        if location_id:
            events_by_location[location_id].append(event)
    for outing in outings:
        location_id = outing_location_id(outing)
        if location_id:
            outings_by_location[location_id].append(outing)

    rows = []
    for location in locations:
        location_id = location.get("id")
        location_events = events_by_location.get(location_id, [])
        location_outings = outings_by_location.get(location_id, [])
        summary = build_summary(location_events, location_outings)
        owner_claimed = bool(location.get("owner_user_id") or location.get("owner_email") or location.get("claimed_by_email"))
        last_activity_date = None
        if location_events:
            last_activity_date = location_events[-1].get("created_at")
        if not last_activity_date and location_outings:
            last_activity_date = location_outings[-1].get("created_at")

        if summary["completed_outings"] > 5:
            health = "Strong"
        elif summary["outing_starts"] == 0:
            health = "No activity yet"
        elif summary["completion_rate"] < 0.2:
            health = "Conversion issue"
        elif not owner_claimed:
            health = "Missing owner"
        else:
            health = "Needs attention"

        rows.append({
            "id": location_id,
            "name": location_display_name(location),
            "type": location_type(location),
            "city": location.get("city") or "Unknown",
            "borough": location.get("borough") or "Unknown",
            "category": location_category(location),
            "owner_status": "Claimed" if owner_claimed else "Missing owner",
            "pro_status": "Pro" if location.get("is_pro") else "Standard",
            "last_activity_date": last_activity_date,
            "health_status": health,
            **summary,
        })
    return rows


def count_by(rows, key_fn):
    counts = {}
    for row in rows:
        key = key_fn(row) or "Unknown"
        key = str(key)
        counts[key] = counts.get(key, 0) + 1
    return [
        {"name": name, "count": count}
        for name, count in sorted(counts.items(), key=lambda item: -item[1])
    ]


def most_searched_category(event, location):
    meta = metadata(event)
    filters = meta.get("filters") if isinstance(meta.get("filters"), dict) else {}
    value = (
        meta.get("category")
        or meta.get("primary_category")
        or meta.get("cuisine")
        or meta.get("cuisine_type")
        or meta.get("activity_type")
        or meta.get("intent")
        or meta.get("query")
        or meta.get("search_query")
        or filters.get("category")
        or meta.get("location_type")
        or (location or {}).get("primary_category")
        or (location or {}).get("category")
        or (location or {}).get("cuisine")
        or (location or {}).get("cuisine_type")
        or (location or {}).get("activity_type")
        or (location or {}).get("location_type")
    )
    return normalize_category(value)


def build_most_searched_categories(events, locations):
    location_map = {location.get("id"): location for location in locations if location.get("id")}
    categories = []
    for event in events:
        if normalize_event_name(event) not in MOST_SEARCHED_EVENTS:
            continue
        categories.append({"category": most_searched_category(event, location_map.get(event_location_id(event)))})
    return [
        {"category": row["name"], "searches": row["count"]}
        for row in count_by(categories, lambda row: row["category"])
    ]


def build_recent_activity(events):
    return [
        {
            "event": normalize_event_name(event) or "unknown",
            "created_at": event.get("created_at") or None,
            "source": event.get("source") or "unknown",
        }
        for event in reversed(events[-50:])
    ]


def build_conversion_breakdown(rows):
    values = [
        {
            "name": row.get("name"),
            "completion_rate": row.get("completion_rate", 0),
            "action_rate": row.get("action_rate", 0),
            "completed_outings": row.get("completed_outings", 0),
        }
        for row in rows
    ]
    return sorted(values, key=lambda row: -safe_number(row.get("completed_outings")))


def read_business_analytics(payload):
    range_name = core.text(payload.get("range") or "30d")
    if range_name not in VALID_RANGES:
        raise ValueError("invalid_range")
    query = core.text(payload.get("q")).lower()
    filtered = payload.get("filtered") is True
    start = range_start(range_name)
    event_filters = [] if start is None else [("created_at", f"gte.{start}")]
    outing_filters = [] if start is None else [("created_at", f"gte.{start}")]

    with ThreadPoolExecutor(max_workers=3) as pool:
        locations_future = pool.submit(core.supabase_rows, "locations", "*", [], limit=1000)
        events_future = pool.submit(core.supabase_rows, "analytics_events", "*", event_filters, limit=1000)
        outings_future = pool.submit(core.supabase_rows, "outings", "*", outing_filters, limit=1000)
        locations, _ = locations_future.result()
        events, _ = events_future.result()
        outings, _ = outings_future.result()

    working = locations
    if query:
        search_fields = (
            "name",
            "restaurant_name",
            "activity_name",
            "city",
            "borough",
            "neighborhood",
            "state",
            "primary_category",
            "category",
            "cuisine",
            "activity_type",
            "owner_email",
            "claimed_by_email",
        )
        working = [
            location for location in locations
            if any(query in str(location.get(field) or "").lower() for field in search_fields)
        ]

    birds = build_location_rollups(working, events, outings)
    sorted_rows = sorted(
        birds,
        key=lambda row: (
            -safe_number(row.get("completed_outings")),
            -safe_number(row.get("search_clicks")),
            -safe_number(row.get("profile_views")),
        ),
    )
    summary = build_summary(events, outings)
    filtered_summary = None
    if filtered:
        working_ids = {location.get("id") for location in working if location.get("id")}
        filtered_events = [event for event in events if event_location_id(event) in working_ids]
        filtered_outings = [outing for outing in outings if outing_location_id(outing) in working_ids]
        filtered_summary = build_summary(filtered_events, filtered_outings)

    return {
        "success": True,
        "range": range_name,
        "summary": summary,
        "daily": build_daily_series(events),
        "top_locations": sorted_rows[:10],
        "low_conversion_locations": [
            row for row in sorted_rows
            if safe_number(row.get("outing_starts")) > 0 and safe_number(row.get("completion_rate")) < 0.25
        ][:10],
        "birds_eye_locations": sorted_rows,
        "most_searched_categories": build_most_searched_categories(events, locations)[:10],
        "event_breakdown": count_by(events, normalize_event_name),
        "source_breakdown": count_by(events, lambda row: row.get("source") or metadata(row).get("source") or "Unknown"),
        "contact_method_breakdown": count_by(outings, lambda row: row.get("contact_method") or "Unknown"),
        "plan_breakdown": count_by(locations, lambda row: row.get("plan") or ("pro" if row.get("is_pro") else "standard")),
        "city_breakdown": count_by(locations, lambda row: row.get("city") or "Unknown"),
        "borough_breakdown": count_by(locations, lambda row: row.get("borough") or "Unknown"),
        "category_breakdown": count_by(locations, location_category),
        "conversion_breakdown": build_conversion_breakdown(sorted_rows),
        "recent_activity": build_recent_activity(events),
        "filtered": filtered,
        "filtered_summary": filtered_summary,
        "filter_meta": {
            "q": query,
            "result_count": len(working),
            "total_count": len(locations),
        },
    }
