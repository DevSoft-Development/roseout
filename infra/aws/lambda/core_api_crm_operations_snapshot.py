from concurrent.futures import ThreadPoolExecutor

import base_core as core


def _read_group(table, select, params=None):
    rows, total = core.supabase_rows(
        table,
        select,
        params or [],
        limit=20,
        count=True,
    )
    return {"data": rows, "count": total if isinstance(total, int) else len(rows)}


def read_crm_operations_snapshot(_payload):
    jobs = {
        "claims": (
            "locations",
            "id,name,claim_status,updated_at",
            [("claim_status", "in.(pending,in_review,information_needed)")],
        ),
        "hidden": (
            "locations",
            "id,name,is_searchable,is_hidden,updated_at",
            [("or", "(is_searchable.eq.false,is_hidden.eq.true)")],
        ),
        "support": (
            "support_tickets",
            "id,subject,status,priority,updated_at",
            [("status", "in.(new,open,pending)")],
        ),
        "tasks": (
            "crm_tasks",
            "id,title,status,priority,due_at,updated_at",
            [("status", "in.(open,blocked,in_progress)")],
        ),
        "codes": (
            "location_claim_codes",
            "id,claim_code,status,expires_at,updated_at",
            [],
        ),
    }

    with ThreadPoolExecutor(max_workers=len(jobs)) as executor:
        futures = {
            name: executor.submit(_read_group, table, select, params)
            for name, (table, select, params) in jobs.items()
        }
        return {name: future.result() for name, future in futures.items()}
