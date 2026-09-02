from concurrent.futures import ThreadPoolExecutor
import re

import base_core as core
from core_api_business_analytics import read_business_analytics
from core_api_communication_center import read_communication_center
from core_api_crm_sms_recipients import read_crm_sms_recipients


def read_admin_communication_search(payload):
    query = core.text(payload.get("q"))[:120]
    if len(query) < 2:
        return {"users": [], "locations": []}

    safe_query = re.sub(r"[%_,()]", " ", query).strip()
    if len(safe_query) < 2:
        return {"users": [], "locations": []}

    def search(table, select, columns):
        or_filter = "(" + ",".join(f"{column}.ilike.%{safe_query}%" for column in columns) + ")"
        rows, _ = core.supabase_rows(
            table,
            select,
            [("or", or_filter)],
            limit=8,
        )
        return rows

    with ThreadPoolExecutor(max_workers=4) as pool:
        users_future = pool.submit(
            search,
            "users",
            "id,full_name,email,phone",
            ["full_name", "email", "phone"],
        )
        restaurants_future = pool.submit(
            search,
            "restaurants",
            "id,name,city,state,email,phone",
            ["name", "city"],
        )
        activities_future = pool.submit(
            search,
            "activities",
            "id,name,city,state,email,phone",
            ["name", "city"],
        )
        locations_future = pool.submit(
            search,
            "locations",
            "id,name,city,state,type,owner_email,phone",
            ["name", "city"],
        )
        users = users_future.result()
        restaurants = restaurants_future.result()
        activities = activities_future.result()
        locations = locations_future.result()

    combined_locations = [
        {
            "id": item.get("id"),
            "name": item.get("name"),
            "city": item.get("city"),
            "state": item.get("state"),
            "contact_email": item.get("email"),
            "contact_phone": item.get("phone"),
            "location_type": "restaurant",
        }
        for item in restaurants
    ] + [
        {
            "id": item.get("id"),
            "name": item.get("name"),
            "city": item.get("city"),
            "state": item.get("state"),
            "contact_email": item.get("email"),
            "contact_phone": item.get("phone"),
            "location_type": "activity",
        }
        for item in activities
    ] + [
        {
            "id": item.get("id"),
            "name": item.get("name"),
            "city": item.get("city"),
            "state": item.get("state"),
            "type": item.get("type"),
            "email": item.get("owner_email"),
            "phone": item.get("phone"),
            "location_type": core.text(item.get("type")) or "location",
        }
        for item in locations
    ]

    return {
        "users": users,
        "locations": combined_locations,
    }


def handler(event, context):
    method = core.request_method(event)
    path = core.request_path(event)

    if path not in {
        "/v1/status",
        "/v1/crm/communication-center/read",
        "/v1/crm/sms/recipients/read",
        "/v1/admin/communication/search/read",
        "/v1/admin/business-analytics/read",
    }:
        return core.handler(event, context)

    body = core.raw_body(event)
    try:
        if not core.authenticate(event, body):
            return core.response(401, {"ok": False, "error": "unauthorized"})
    except Exception:
        return core.response(503, {"ok": False, "error": "core_api_auth_unavailable"})

    if method == "GET" and path == "/v1/status":
        return core.response(200, {
            "ok": True,
            "service": "theouthaven-core-api",
            "environment": core.ENVIRONMENT,
            "operations": [
                "crm.context",
                "crm.location_health.read",
                "crm.communication_center.read",
                "crm.sms_recipients.read",
                "admin.communication.search.read",
                "admin.business_analytics.read",
            ],
        })

    if method == "POST" and path == "/v1/crm/communication-center/read":
        try:
            payload = core.parse_json(body)
            return core.response(200, read_communication_center(payload))
        except ValueError as exc:
            return core.response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return core.response(500, {"ok": False, "error": "crm_communication_center_read_failed"})

    if method == "POST" and path == "/v1/crm/sms/recipients/read":
        try:
            payload = core.parse_json(body)
            return core.response(200, read_crm_sms_recipients(payload))
        except ValueError as exc:
            return core.response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return core.response(500, {"ok": False, "error": "crm_sms_recipients_read_failed"})

    if method == "POST" and path == "/v1/admin/communication/search/read":
        try:
            payload = core.parse_json(body)
            return core.response(200, read_admin_communication_search(payload))
        except ValueError as exc:
            return core.response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return core.response(500, {"ok": False, "error": "admin_communication_search_read_failed"})

    if method == "POST" and path == "/v1/admin/business-analytics/read":
        try:
            payload = core.parse_json(body)
            return core.response(200, read_business_analytics(payload))
        except ValueError as exc:
            return core.response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return core.response(500, {"ok": False, "error": "admin_business_analytics_read_failed"})

    return core.response(404, {"ok": False, "error": "not_found"})
