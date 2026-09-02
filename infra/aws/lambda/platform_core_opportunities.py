import re
from concurrent.futures import ThreadPoolExecutor

import platform_core_api_base as base

OPPORTUNITY_SELECT = (
    "*,crm_accounts(id,name),locations:primary_location_id(id,name),"
    "crm_tasks(count),crm_opportunity_contacts(count)"
)
TOKEN_RE = re.compile(r"^[a-z0-9_:-]{1,80}$", re.I)
PAGE_SIZES = {25, 250}
PIPELINE_MODES = {"all", "unassigned", "values"}


def text(value):
    return str(value or "").strip()


def optional_uuid(payload, key):
    value = payload.get(key)
    if value is None or value == "":
        return None
    if not base.valid_uuid(value):
        raise ValueError(f"invalid_{key}")
    return value


def optional_token(payload, key):
    value = text(payload.get(key))
    if not value:
        return None
    if not TOKEN_RE.fullmatch(value):
        raise ValueError(f"invalid_{key}")
    return value


def pipeline_values(payload):
    raw = payload.get("pipelineValues")
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > 20:
        raise ValueError("invalid_pipelineValues")
    values = []
    for item in raw:
        value = text(item)
        if not TOKEN_RE.fullmatch(value):
            raise ValueError("invalid_pipelineValues")
        if value not in values:
            values.append(value)
    return values


def sanitize(payload):
    try:
        page = max(1, int(payload.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        requested_size = int(payload.get("size") or 25)
    except (TypeError, ValueError):
        requested_size = 25
    size = requested_size if requested_size in PAGE_SIZES else 25

    mode = text(payload.get("pipelineMode") or "all").lower()
    if mode not in PIPELINE_MODES:
        raise ValueError("invalid_pipelineMode")
    values = pipeline_values(payload)
    if mode == "values" and not values:
        raise ValueError("pipelineValues_required")

    search = text(payload.get("search"))[:200]
    stage_pipeline = optional_token(payload, "stagePipeline") or "reserve_pro"
    return {
        "page": page,
        "size": size,
        "pipelineMode": mode,
        "pipelineValues": values,
        "stage": optional_token(payload, "stage"),
        "forecast": optional_token(payload, "forecast"),
        "risk": optional_token(payload, "risk"),
        "search": search,
        "accountId": optional_uuid(payload, "accountId"),
        "contactId": optional_uuid(payload, "contactId"),
        "locationId": optional_uuid(payload, "locationId"),
        "opportunityId": optional_uuid(payload, "opportunityId"),
        "selectorAccountId": optional_uuid(payload, "selectorAccountId"),
        "stagePipeline": stage_pipeline,
    }


def relationship_value(row, key):
    value = row.get(key) if isinstance(row, dict) else None
    if isinstance(value, dict):
        return value
    if isinstance(value, list):
        return value[0] if value else None
    return None


def opportunity_filter_params(input_data, *, include_pipeline=True, include_detail_filters=True):
    params = [("archived_at", "is.null")]
    if include_pipeline:
        if input_data["pipelineMode"] == "unassigned":
            params.append(("pipeline_key", "is.null"))
        elif input_data["pipelineMode"] == "values":
            params.append(("pipeline_key", f"in.({','.join(input_data['pipelineValues'])})"))
    if include_detail_filters:
        if input_data["stage"]:
            params.append(("stage", f"eq.{input_data['stage']}"))
        if input_data["forecast"]:
            params.append(("forecast_category", f"eq.{input_data['forecast']}"))
        if input_data["risk"]:
            params.append(("risk_level", f"eq.{input_data['risk']}"))
        if input_data["search"]:
            escaped = re.sub(r"([%_\\])", r"\\\1", input_data["search"])
            params.append(("name", f"ilike.%{escaped}%"))
        if input_data["opportunityId"]:
            params.append(("id", f"eq.{input_data['opportunityId']}"))
    if input_data["accountId"]:
        params.append(("account_id", f"eq.{input_data['accountId']}"))
    if input_data["contactId"]:
        params.append(("primary_contact_id", f"eq.{input_data['contactId']}"))
    if input_data["locationId"]:
        params.append(("primary_location_id", f"eq.{input_data['locationId']}"))
    return params


def fetch_opportunities(input_data):
    params = opportunity_filter_params(input_data)
    params.append(("order", "last_stage_changed_at.desc"))
    return base.supabase_rows(
        "crm_opportunities",
        OPPORTUNITY_SELECT,
        params,
        limit=input_data["size"],
        offset=(input_data["page"] - 1) * input_data["size"],
        count=True,
    )


def fetch_stages(input_data):
    rows, _ = base.supabase_rows(
        "crm_pipeline_stages",
        "*,crm_pipelines!inner(pipeline_key)",
        [
            ("crm_pipelines.pipeline_key", f"eq.{input_data['stagePipeline']}"),
            ("order", "display_order.asc"),
        ],
    )
    return rows


def fetch_pipeline_keys(input_data):
    params = opportunity_filter_params(input_data, include_pipeline=False, include_detail_filters=False)
    rows, _ = base.supabase_rows("crm_opportunities", "pipeline_key", params)
    return [row.get("pipeline_key") for row in rows]


def fetch_accounts():
    rows, _ = base.supabase_rows(
        "crm_accounts",
        "id,name",
        [("order", "name.asc")],
        limit=100,
    )
    return rows


def fetch_contacts(account_id):
    if account_id:
        rows, _ = base.supabase_rows(
            "crm_account_contacts",
            "crm_contacts(id,full_name,email)",
            [("account_id", f"eq.{account_id}"), ("is_active", "eq.true")],
            limit=100,
        )
        return [value for value in (relationship_value(row, "crm_contacts") for row in rows) if value]
    rows, _ = base.supabase_rows(
        "crm_contacts",
        "id,full_name,email",
        [("order", "full_name.asc")],
        limit=100,
    )
    return rows


def fetch_locations(account_id):
    if account_id:
        rows, _ = base.supabase_rows(
            "crm_account_locations",
            "locations(id,name,city,state)",
            [("account_id", f"eq.{account_id}"), ("status", "eq.active")],
            limit=100,
        )
        return [value for value in (relationship_value(row, "locations") for row in rows) if value]
    rows, _ = base.supabase_rows(
        "locations",
        "id,name,city,state",
        [("order", "name.asc")],
        limit=100,
    )
    return rows


def opportunity_page(payload):
    input_data = sanitize(payload)
    selector_account_id = input_data["selectorAccountId"]
    with ThreadPoolExecutor(max_workers=6) as pool:
        opportunities_future = pool.submit(fetch_opportunities, input_data)
        stages_future = pool.submit(fetch_stages, input_data)
        pipeline_keys_future = pool.submit(fetch_pipeline_keys, input_data)
        accounts_future = pool.submit(fetch_accounts)
        contacts_future = pool.submit(fetch_contacts, selector_account_id)
        locations_future = pool.submit(fetch_locations, selector_account_id)

        rows, count = opportunities_future.result()
        stages = stages_future.result()
        pipeline_keys = pipeline_keys_future.result()
        accounts = accounts_future.result()
        contacts = contacts_future.result()
        locations = locations_future.result()

    return {
        "success": True,
        "rows": rows,
        "count": count or 0,
        "page": input_data["page"],
        "size": input_data["size"],
        "stages": stages,
        "pipelineKeys": pipeline_keys,
        "selectors": {
            "accounts": accounts,
            "contacts": contacts,
            "locations": locations,
        },
    }
