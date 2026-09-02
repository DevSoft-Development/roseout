import json

import platform_core_api_base as base
import platform_core_opportunities as opportunities

OPPORTUNITY_PATH = "/v1/crm/opportunities/page"
OPPORTUNITY_OPERATION = "crm.opportunities.page"


def _status_with_extensions(event, context):
    result = base.handler(event, context)
    if int(result.get("statusCode") or 500) != 200:
        return result
    try:
        payload = json.loads(result.get("body") or "{}")
    except json.JSONDecodeError:
        return result
    operations = payload.get("operations") if isinstance(payload.get("operations"), list) else []
    if OPPORTUNITY_OPERATION not in operations:
        operations.append(OPPORTUNITY_OPERATION)
    payload["operations"] = operations
    result["body"] = json.dumps(payload)
    return result


def handler(event, context):
    method = base.request_method(event)
    path = base.request_path(event)

    if method == "GET" and path == "/v1/status":
        return _status_with_extensions(event, context)

    if method == "POST" and path == OPPORTUNITY_PATH:
        body = base.raw_body(event)
        try:
            if not base.authenticate(event, body):
                return base.response(401, {"ok": False, "error": "unauthorized"})
        except Exception:
            return base.response(503, {"ok": False, "error": "core_api_auth_unavailable"})
        try:
            payload = opportunities.opportunity_page(base.parse_json(body))
            return base.response(200, payload)
        except ValueError as exc:
            return base.response(400, {"ok": False, "error": str(exc)})
        except Exception:
            return base.response(500, {"ok": False, "error": "crm_opportunity_page_read_failed"})

    return base.handler(event, context)
