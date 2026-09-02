from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import base_core as core


OUTREACH_TASK_TYPES = [
    "social_outreach",
    "phone_outreach",
    "email_outreach",
    "site_visit",
    "follow_up",
    "claim_code_delivery",
]


def snapshot_bucket(table, select, filters=None, limit=20):
    data, count = core.supabase_rows(
        table,
        select,
        filters or [],
        limit=limit,
        count=True,
    )
    return {"data": data, "count": int(count or 0)}


def snapshot_rows(table, select, filters=None, limit=5000):
    data, _ = core.supabase_rows(
        table,
        select,
        filters or [],
        limit=limit,
    )
    return data


def read_crm_operations_snapshot(payload):
    # Warm the service-role credential before concurrent Data API requests.
    core.load_secret(core.SUPABASE_SERVICE_ROLE_SECRET_ID)

    jobs = {
        "claims": lambda: snapshot_bucket(
            "locations",
            "id,name,claim_status,updated_at",
            [("claim_status", "in.(pending,in_review,information_needed)")],
        ),
        "hidden": lambda: snapshot_bucket(
            "locations",
            "id,name,is_searchable,is_hidden,updated_at",
            [("or", "(is_searchable.eq.false,is_hidden.eq.true)")],
        ),
        "support": lambda: snapshot_bucket(
            "support_tickets",
            "id,subject,status,priority,updated_at",
            [("status", "in.(new,open,pending)")],
        ),
        "tasks": lambda: snapshot_bucket(
            "crm_tasks",
            "id,title,status,priority,due_at,updated_at",
            [("status", "in.(open,blocked,in_progress)")],
        ),
        "codes": lambda: snapshot_bucket(
            "location_claim_codes",
            "id,claim_code,status,expires_at,updated_at",
        ),
    }

    results = {}
    with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
        futures = {name: pool.submit(fn) for name, fn in jobs.items()}
        for name, future in futures.items():
            results[name] = future.result()

    return {"success": True, **results}


def read_crm_report_snapshot(payload):
    now = datetime.now(timezone.utc)
    default_start = (now - timedelta(days=30)).date().isoformat()
    default_end = now.date().isoformat()
    start = core.text(payload.get("start")).strip()[:32] or default_start
    end = core.text(payload.get("end")).strip()[:32] or default_end

    core.load_secret(core.SUPABASE_SERVICE_ROLE_SECRET_ID)

    date_filters = [("created_at", f"gte.{start}"), ("created_at", f"lte.{end}")]
    outreach_types = "in.(" + ",".join(OUTREACH_TASK_TYPES) + ")"
    jobs = {
        "opps": lambda: snapshot_rows(
            "crm_opportunities",
            "amount,weighted_amount,stage,forecast_category,created_at",
            date_filters,
        ),
        "claims": lambda: snapshot_rows(
            "locations",
            "claim_status,created_at",
            date_filters,
        ),
        "support": lambda: snapshot_rows(
            "support_tickets",
            "status,priority,category,created_at,closed_at",
            date_filters,
        ),
        "outreach": lambda: snapshot_rows(
            "crm_tasks",
            "task_type,status,created_at",
            [("task_type", outreach_types), *date_filters],
        ),
    }

    results = {}
    with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
        futures = {name: pool.submit(fn) for name, fn in jobs.items()}
        for name, future in futures.items():
            results[name] = future.result()

    return {
        "success": True,
        "start": start,
        "end": end,
        **results,
    }
