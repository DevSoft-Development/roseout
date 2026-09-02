import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import base_core as core

BUSINESS_PRO_MONTHLY_CENTS = 9900
BUSINESS_PRO_ALIASES = {
    "pro",
    "business_pro",
    "business-pro",
    "growth_pro",
    "growth-pro",
    "growth pro",
    "partner_99",
    "partner_pro",
    "pro_reserve",
    "reserve",
    "paid",
}
ACTIVE_PAID_STATUSES = {"active", "grace_period", "comped"}


def number(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def integer(value):
    return int(number(value))


def js_round(value):
    return math.floor(number(value) + 0.5)


def is_business_pro(plan):
    return core.text(plan).lower() in BUSINESS_PRO_ALIASES


def subscription_amount(row):
    explicit = integer(row.get("subscription_amount_cents"))
    if explicit:
        return explicit
    if is_business_pro(row.get("subscription_plan")) and core.text(row.get("subscription_status")).lower() == "active":
        return BUSINESS_PRO_MONTHLY_CENTS
    return 0


def payment_amount_paid(row):
    payload = row.get("payload")
    if not isinstance(payload, dict):
        return 0
    data = payload.get("data")
    if not isinstance(data, dict):
        return 0
    obj = data.get("object")
    if not isinstance(obj, dict):
        return 0
    return integer(obj.get("amount_paid") or obj.get("amount_total") or obj.get("amount_received"))


def exact_count(table, filters=None, select="id"):
    _, total = core.supabase_rows(table, select, filters or [], limit=1, count=True)
    return int(total or 0)


def rows(table, select, filters=None, limit=5000):
    payload, _ = core.supabase_rows(table, select, filters or [], limit=limit)
    return payload


def read_admin_overview(payload):
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    seven_days_out = (now + timedelta(days=7)).date().isoformat()
    thirty_days_ago = (now - timedelta(days=30)).isoformat().replace("+00:00", "Z")

    # Warm the shared service-role credential before fanning out so a cold Lambda
    # does not race Secrets Manager from every worker thread.
    core.load_secret(core.SUPABASE_SERVICE_ROLE_SECRET_ID)

    jobs = {
        "restaurants": lambda: exact_count("restaurants"),
        "activities": lambda: exact_count("activities"),
        "reservations": lambda: exact_count("location_reservations"),
        "today_reservations": lambda: exact_count(
            "location_reservations",
            [
                ("reservation_date", f"eq.{today}"),
                ("status", "not.in.(cancelled,declined)"),
            ],
        ),
        "upcoming_reservations": lambda: exact_count(
            "location_reservations",
            [
                ("reservation_date", f"gte.{today}"),
                ("reservation_date", f"lte.{seven_days_out}"),
                ("status", "not.in.(cancelled,declined)"),
            ],
        ),
        "active_events": lambda: exact_count(
            "events",
            [
                ("source_kind", "eq.native"),
                ("status", "eq.scheduled"),
                ("searchable", "eq.true"),
            ],
        ),
        "active_experiences": lambda: exact_count(
            "experiences",
            [("status", "eq.published"), ("searchable", "eq.true")],
        ),
        "event_orders": lambda: rows(
            "event_ticket_orders",
            "id,quantity,status,payment_status,ticket_subtotal_cents,total_cents,platform_fee_cents,created_at",
            [("created_at", f"gte.{thirty_days_ago}")],
        ),
        "experience_bookings": lambda: rows(
            "experience_bookings",
            "id,experience_id,party_size,status,created_at",
            [("created_at", f"gte.{thirty_days_ago}")],
        ),
        "experience_prices": lambda: rows("experiences", "id,price_per_person"),
        "billing_locations": lambda: rows(
            "locations",
            "id,subscription_plan,subscription_status,subscription_amount_cents,subscription_interval",
        ),
        "payment_logs": lambda: rows(
            "payment_logs",
            "id,event_type,payload,created_at",
            [
                ("created_at", f"gte.{thirty_days_ago}"),
                ("event_type", "eq.invoice.payment_succeeded"),
            ],
        ),
        "open_tickets": lambda: exact_count(
            "support_tickets",
            [("status", "not.in.(closed,resolved)")],
        ),
        "ml_scored": lambda: exact_count("location_ml_features", select="location_id"),
        "ml_intent": lambda: exact_count("location_intent_ml_features"),
        "ml_pair": lambda: exact_count("location_pair_ml_features"),
        "ml_last_run": lambda: rows(
            "location_ml_score_runs",
            "created_at",
            [("order", "created_at.desc")],
            limit=1,
        ),
        "generated_sites": lambda: exact_count("business_websites"),
        "live_generated_sites": lambda: exact_count("business_websites", [("status", "eq.live")]),
        "hosting_nodes": lambda: exact_count("website_hosting_nodes"),
        "healthy_hosting_nodes": lambda: exact_count(
            "website_hosting_nodes",
            [("status", "eq.healthy")],
        ),
    }

    results = {}
    with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
        futures = {name: pool.submit(fn) for name, fn in jobs.items()}
        for name, future in futures.items():
            results[name] = future.result()

    event_order_rows = results["event_orders"]
    paid_event_orders = [
        row for row in event_order_rows
        if core.text(row.get("status")).lower() not in {"refunded", "cancelled"}
        and (
            core.text(row.get("payment_status")).lower() == "paid"
            or core.text(row.get("status")).lower() == "confirmed"
        )
    ]
    event_orders = len(paid_event_orders)
    event_tickets = sum(integer(row.get("quantity")) for row in paid_event_orders)
    event_sales_cents = sum(
        integer(row.get("ticket_subtotal_cents") or row.get("total_cents"))
        for row in paid_event_orders
    )
    event_platform_revenue_cents = sum(
        integer(row.get("platform_fee_cents")) for row in paid_event_orders
    )

    active_experience_bookings = [
        row for row in results["experience_bookings"]
        if core.text(row.get("status")).lower() not in {"cancelled", "refunded"}
    ]
    experience_booking_count = len(active_experience_bookings)
    experience_guests = sum(integer(row.get("party_size")) for row in active_experience_bookings)
    price_by_experience = {
        str(row.get("id")): number(row.get("price_per_person"))
        for row in results["experience_prices"]
    }
    experience_estimated_value_cents = sum(
        js_round(
            number(row.get("party_size"))
            * price_by_experience.get(str(row.get("experience_id")), 0)
            * 100
        )
        for row in active_experience_bookings
    )

    active_paid_locations = [
        row for row in results["billing_locations"]
        if core.text(row.get("subscription_status")).lower() in ACTIVE_PAID_STATUSES
        and is_business_pro(row.get("subscription_plan"))
    ]
    mrr_cents = 0
    for row in active_paid_locations:
        amount = subscription_amount(row)
        interval = core.text(row.get("subscription_interval")).lower()
        mrr_cents += js_round(amount / 12) if interval in {"year", "annual"} else amount

    subscription_collected_30d_cents = sum(
        payment_amount_paid(row) for row in results["payment_logs"]
    )

    last_run_rows = results["ml_last_run"]
    ml_last_run_created_at = last_run_rows[0].get("created_at") if last_run_rows else None

    return {
        "success": True,
        "totalLocations": int(results["restaurants"] + results["activities"]),
        "reservations": results["reservations"],
        "todayReservations": results["today_reservations"],
        "upcomingReservations": results["upcoming_reservations"],
        "activeEvents": results["active_events"],
        "activeExperiences": results["active_experiences"],
        "eventOrders": event_orders,
        "eventTickets": event_tickets,
        "eventSalesCents": event_sales_cents,
        "eventPlatformRevenueCents": event_platform_revenue_cents,
        "experienceBookingCount": experience_booking_count,
        "experienceGuests": experience_guests,
        "experienceEstimatedValueCents": int(experience_estimated_value_cents),
        "activePaidLocations": len(active_paid_locations),
        "mrrCents": int(mrr_cents),
        "subscriptionCollected30dCents": int(subscription_collected_30d_cents),
        "trackedPlatformRevenue30dCents": int(subscription_collected_30d_cents + event_platform_revenue_cents),
        "openTickets": results["open_tickets"],
        "mlScored": results["ml_scored"],
        "mlIntentRows": results["ml_intent"],
        "mlPairRows": results["ml_pair"],
        "mlLastRunCreatedAt": ml_last_run_created_at,
        "generatedSites": results["generated_sites"],
        "liveGeneratedSites": results["live_generated_sites"],
        "hostingNodes": results["hosting_nodes"],
        "healthyHostingNodes": results["healthy_hosting_nodes"],
    }
