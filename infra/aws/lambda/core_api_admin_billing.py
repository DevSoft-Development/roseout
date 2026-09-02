from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import math

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

LOCATION_SELECT = (
    "id,name,restaurant_name,activity_name,owner_email,claimed_by_email,"
    "subscription_plan,subscription_status,subscription_amount_cents,subscription_interval,"
    "next_billing_date,current_period_end,trial_ends_at,stripe_customer_id,stripe_subscription_id,"
    "last_payment_failed_at,billing_grace_ends_at,canceled_at,created_at"
)


def as_int(value):
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def js_round_positive(value):
    return int(math.floor(float(value) + 0.5))


def parse_timestamp(value):
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def is_business_pro(plan):
    return core.text(plan).strip().lower() in BUSINESS_PRO_ALIASES


def subscription_amount(row):
    configured = as_int(row.get("subscription_amount_cents"))
    if configured:
        return configured
    if is_business_pro(row.get("subscription_plan")) and core.text(row.get("subscription_status")) == "active":
        return BUSINESS_PRO_MONTHLY_CENTS
    return 0


def object_id(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return core.text(value.get("id")) or None
    return None


def normalize_payment_event(row):
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    obj = data.get("object") if isinstance(data.get("object"), dict) else {}
    metadata = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
    event_type = core.text(row.get("event_type"))

    invoice_id = None
    if event_type.startswith("invoice."):
        invoice_id = object_id(obj.get("id"))
    if not invoice_id:
        invoice_id = object_id(obj.get("invoice"))

    amount_paid = obj.get("amount_paid")
    if amount_paid is None:
        amount_paid = obj.get("amount_total")
    if amount_paid is None:
        amount_paid = obj.get("amount_received")

    location_id = core.text(row.get("location_id")) or core.text(metadata.get("location_id")) or None

    return {
        "id": row.get("id"),
        "event_type": event_type,
        "stripe_event_id": row.get("stripe_event_id"),
        "stripe_customer_id": object_id(obj.get("customer")),
        "stripe_subscription_id": object_id(obj.get("subscription")),
        "stripe_invoice_id": invoice_id,
        "location_id": location_id,
        "amount_paid_cents": as_int(amount_paid),
        "amount_due_cents": as_int(obj.get("amount_due")),
        "currency": core.text(obj.get("currency")) or None,
        "status": core.text(obj.get("status")) or None,
        "created_at": row.get("created_at"),
        "processing_error": row.get("processing_error"),
    }


def read_admin_billing(payload):
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    seven_days = now + timedelta(days=7)
    thirty_days = now + timedelta(days=30)

    core.load_secret(core.SUPABASE_SERVICE_ROLE_SECRET_ID)

    with ThreadPoolExecutor(max_workers=2) as pool:
        locations_future = pool.submit(
            core.supabase_rows,
            "locations",
            LOCATION_SELECT,
            [],
            limit=1000,
        )
        logs_future = pool.submit(
            core.supabase_rows,
            "payment_logs",
            "id,event_type,stripe_event_id,location_id,payload,created_at,processing_error",
            [("order", "created_at.desc")],
            limit=100,
        )
        locations, _ = locations_future.result()
        log_rows, _ = logs_future.result()

    logs = [normalize_payment_event(row) for row in log_rows]

    active_paid = [
        row for row in locations
        if core.text(row.get("subscription_status")) in {"active", "grace_period", "comped"}
        and is_business_pro(row.get("subscription_plan"))
    ]
    trialing = [row for row in locations if core.text(row.get("subscription_status")) == "trialing"]
    past_due = [
        row for row in locations
        if core.text(row.get("subscription_status")) in {"past_due", "unpaid"}
    ]
    canceled_this_month = [
        row for row in locations
        if (parse_timestamp(row.get("canceled_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= month_start
    ]

    mrr_cents = 0
    for row in active_paid:
        value = subscription_amount(row)
        if core.text(row.get("subscription_interval")) in {"year", "annual"}:
            value = js_round_positive(value / 12)
        mrr_cents += value

    collected_this_month = 0
    for row in logs:
        created_at = parse_timestamp(row.get("created_at"))
        if row.get("event_type") == "invoice.payment_succeeded" and created_at and created_at >= month_start:
            collected_this_month += as_int(row.get("amount_paid_cents"))

    def upcoming(cutoff):
        result = []
        for row in locations:
            next_billing = parse_timestamp(row.get("next_billing_date"))
            if next_billing and now <= next_billing <= cutoff:
                result.append(row)
        return result

    upcoming_seven = upcoming(seven_days)
    upcoming_thirty = upcoming(thirty_days)
    upcoming_rows = sorted(
        upcoming_thirty,
        key=lambda row: parse_timestamp(row.get("next_billing_date")) or datetime.max.replace(tzinfo=timezone.utc),
    )[:20]
    trial_rows = [
        row for row in trialing
        if (parse_timestamp(row.get("trial_ends_at")) or datetime.max.replace(tzinfo=timezone.utc)) <= thirty_days
    ][:20]

    return {
        "success": True,
        "sourceError": False,
        "metrics": {
            "activePaidLocations": len(active_paid),
            "trialingLocations": len(trialing),
            "pastDueLocations": len(past_due),
            "canceledThisMonth": len(canceled_this_month),
            "mrrCents": mrr_cents,
            "arrCents": mrr_cents * 12,
            "collectedThisMonthCents": collected_this_month,
            "upcoming7d": len(upcoming_seven),
            "upcoming30d": len(upcoming_rows),
            "pastDueEstimatedCents": sum(subscription_amount(row) for row in past_due),
        },
        "upcomingRows": upcoming_rows,
        "pastDueRows": past_due,
        "recentEvents": logs[:20],
        "trialRows": trial_rows,
    }
