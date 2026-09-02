from concurrent.futures import ThreadPoolExecutor
import re

import base_core as core
from core_api_admin_billing import read_admin_billing
from core_api_admin_users import read_admin_user_detail, read_admin_users_list
from core_api_admin_overview import read_admin_overview
from core_api_business_analytics import read_business_analytics
from core_api_communication_center import read_communication_center
from core_api_crm_sms_recipients import read_crm_sms_recipients
from core_api_crm_snapshots import read_crm_operations_snapshot, read_crm_report_snapshot


PAYOUT_LOCATION_SELECT = (
    "id,name,restaurant_name,activity_name,stripe_connect_account_id,"
    "stripe_connect_account_api_version,stripe_connect_onboarding_status,"
    "stripe_connect_payouts_enabled,stripe_connect_charges_enabled,"
    "stripe_connect_requires_action,stripe_connect_updated_at"
)
PAYOUT_ORGANIZATION_SELECT = (
    "id,name,stripe_connect_account_id,stripe_connect_account_api_version,"
    "stripe_connect_onboarding_status,stripe_connect_payouts_enabled,"
    "stripe_connect_charges_enabled,stripe_connect_requires_action,"
    "stripe_connect_updated_at"
)


def payout_owner(row, owner_type):
    account_id = core.text(row.get("stripe_connect_account_id"))
    if not account_id:
        return None
    if owner_type == "Location":
        name = (
            core.text(row.get("name"))
            or core.text(row.get("restaurant_name"))
            or core.text(row.get("activity_name"))
            or "Location"
        )
    else:
        name = core.text(row.get("name")) or "Organizer"
    return {
        "ownerType": owner_type,
        "ownerId": core.text(row.get("id")),
        "name": name,
        "accountId": account_id,
        "apiVersion": core.text(row.get("stripe_connect_account_api_version")) or "v1",
        "onboarding": core.text(row.get("stripe_connect_onboarding_status")) or "unknown",
        "payoutsEnabled": bool(row.get("stripe_connect_payouts_enabled")),
        "chargesEnabled": bool(row.get("stripe_connect_charges_enabled")),
        "requiresAction": bool(row.get("stripe_connect_requires_action")),
        "updatedAt": row.get("stripe_connect_updated_at"),
    }


def payout_audit_row(row):
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    obj = data.get("object") if isinstance(data.get("object"), dict) else {}
    amount = obj.get("amount")
    try:
        amount_value = int(amount) if amount is not None else None
    except (TypeError, ValueError):
        amount_value = None
    return {
        "id": core.text(row.get("id")),
        "eventType": core.text(row.get("event_type")) or "payout",
        "payoutId": core.text(obj.get("id")) or None,
        "amount": amount_value,
        "currency": core.text(obj.get("currency")) or None,
        "createdAt": row.get("created_at"),
        "processingError": core.text(row.get("processing_error")) or None,
        "failureMessage": core.text(obj.get("failure_message")) or None,
    }


def read_admin_payouts(payload):
    core.load_secret(core.SUPABASE_SERVICE_ROLE_SECRET_ID)
    with ThreadPoolExecutor(max_workers=3) as pool:
        locations_future = pool.submit(
            core.supabase_rows,
            "locations",
            PAYOUT_LOCATION_SELECT,
            [("stripe_connect_account_id", "not.is.null")],
            limit=100,
        )
        organizations_future = pool.submit(
            core.supabase_rows,
            "organizations",
            PAYOUT_ORGANIZATION_SELECT,
            [("stripe_connect_account_id", "not.is.null")],
            limit=100,
        )
        logs_future = pool.submit(
            core.supabase_rows,
            "payment_logs",
            "id,event_type,payload,created_at,processing_error",
            [("event_type", "like.payout.%"), ("order", "created_at.desc")],
            limit=50,
        )
        locations, _ = locations_future.result()
        organizations, _ = organizations_future.result()
        payout_logs, _ = logs_future.result()

    owners = []
    for row in locations:
        owner = payout_owner(row, "Location")
        if owner:
            owners.append(owner)
    for row in organizations:
        owner = payout_owner(row, "Organizer")
        if owner:
            owners.append(owner)
    return {
        "success": True,
        "owners": owners,
        "auditRows": [payout_audit_row(row) for row in payout_logs],
    }


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


def read_support_operations_settings(payload):
    core.load_secret(core.SUPABASE_SERVICE_ROLE_SECRET_ID)
    jobs = {
        "groups": ("support_groups", "sort_order.asc"),
        "slas": ("support_sla_policies", "first_response_minutes.asc"),
        "businessHours": ("support_business_hours", "day_of_week.asc"),
        "macros": ("support_macros", "sort_order.asc"),
        "triggers": ("support_triggers", "sort_order.asc"),
        "automations": ("support_automation_rules", "name.asc"),
    }

    def load(table, order):
        rows, _ = core.supabase_rows(table, "*", [("order", order)], limit=1000)
        return rows

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {
            name: pool.submit(load, table, order)
            for name, (table, order) in jobs.items()
        }
        results = {name: future.result() for name, future in futures.items()}

    return {"success": True, **results}


def read_support_case(payload):
    ticket_id = core.text(payload.get("ticketId"))
    if not core.valid_uuid(ticket_id):
        raise ValueError("valid_ticketId_required")

    core.load_secret(core.SUPABASE_SERVICE_ROLE_SECRET_ID)

    with ThreadPoolExecutor(max_workers=3) as pool:
        ticket_future = pool.submit(
            core.supabase_get,
            "support_tickets",
            "*",
            [("id", f"eq.{ticket_id}")],
        )
        messages_future = pool.submit(
            core.supabase_rows,
            "support_ticket_messages",
            "*",
            [("ticket_id", f"eq.{ticket_id}"), ("order", "created_at.asc")],
            limit=1000,
        )
        activities_future = pool.submit(
            core.supabase_rows,
            "crm_activities",
            "*",
            [("source_record_id", f"eq.{ticket_id}"), ("order", "occurred_at.desc")],
            limit=100,
        )
        ticket = ticket_future.result()
        messages, _ = messages_future.result()
        activities, _ = activities_future.result()

    if ticket is None:
        raise RuntimeError("support_ticket_not_found")

    return {
        "success": True,
        "ticket": ticket,
        "messages": messages,
        "activities": activities,
    }


def handler(event, context):
    method = core.request_method(event)
    path = core.request_path(event)

    if path not in {
        "/v1/status",
        "/v1/crm/communication-center/read",
        "/v1/crm/sms/recipients/read",
        "/v1/crm/operations-snapshot/read",
        "/v1/crm/report-snapshot/read",
        "/v1/crm/support/settings/read",
        "/v1/crm/support/case/read",
        "/v1/admin/communication/search/read",
        "/v1/admin/business-analytics/read",
        "/v1/admin/overview/read",
        "/v1/admin/billing/read",
        "/v1/admin/payouts/read",
        "/v1/admin/users/list/read",
        "/v1/admin/users/detail/read",
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
                "crm.operations_snapshot.read",
                "crm.report_snapshot.read",
                "crm.support_settings.read",
                "crm.support_case.read",
                "admin.communication.search.read",
                "admin.business_analytics.read",
                "admin.overview.read",
                "admin.billing.read",
                "admin.payouts.read",
                "admin.users.list.read",
                "admin.users.detail.read",
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

    if method == "POST" and path == "/v1/crm/operations-snapshot/read":
        try:
            payload = core.parse_json(body)
            return core.response(200, read_crm_operations_snapshot(payload))
        except ValueError as exc:
            return core.response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return core.response(500, {"ok": False, "error": "crm_operations_snapshot_read_failed"})

    if method == "POST" and path == "/v1/crm/report-snapshot/read":
        try:
            payload = core.parse_json(body)
            return core.response(200, read_crm_report_snapshot(payload))
        except ValueError as exc:
            return core.response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return core.response(500, {"ok": False, "error": "crm_report_snapshot_read_failed"})

    if method == "POST" and path == "/v1/crm/support/settings/read":
        try:
            payload = core.parse_json(body)
            return core.response(200, read_support_operations_settings(payload))
        except ValueError as exc:
            return core.response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return core.response(500, {"ok": False, "error": "crm_support_settings_read_failed"})

    if method == "POST" and path == "/v1/crm/support/case/read":
        try:
            payload = core.parse_json(body)
            return core.response(200, read_support_case(payload))
        except ValueError as exc:
            return core.response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return core.response(500, {"ok": False, "error": "crm_support_case_read_failed"})

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

    if method == "POST" and path == "/v1/admin/overview/read":
        try:
            payload = core.parse_json(body)
            return core.response(200, read_admin_overview(payload))
        except ValueError as exc:
            return core.response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return core.response(500, {"ok": False, "error": "admin_overview_read_failed"})

    if method == "POST" and path == "/v1/admin/billing/read":
        try:
            payload = core.parse_json(body)
            return core.response(200, read_admin_billing(payload))
        except ValueError as exc:
            return core.response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return core.response(500, {"ok": False, "error": "admin_billing_read_failed"})

    if method == "POST" and path == "/v1/admin/payouts/read":
        try:
            payload = core.parse_json(body)
            return core.response(200, read_admin_payouts(payload))
        except ValueError as exc:
            return core.response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return core.response(500, {"ok": False, "error": "admin_payouts_read_failed"})

    if method == "POST" and path == "/v1/admin/users/list/read":
        try:
            payload = core.parse_json(body)
            return core.response(200, read_admin_users_list(payload))
        except ValueError as exc:
            return core.response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return core.response(500, {"ok": False, "error": "admin_users_list_read_failed"})

    if method == "POST" and path == "/v1/admin/users/detail/read":
        try:
            payload = core.parse_json(body)
            return core.response(200, read_admin_user_detail(payload))
        except ValueError as exc:
            return core.response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return core.response(500, {"ok": False, "error": "admin_users_detail_read_failed"})

    return core.response(404, {"ok": False, "error": "not_found"})
