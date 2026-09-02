import json

import base_core as core
from core_api_communication_center import read_communication_center
from core_api_crm_sms_recipients import read_crm_sms_recipients


def handler(event, context):
    method = core.request_method(event)
    path = core.request_path(event)

    if path not in {
        "/v1/status",
        "/v1/crm/communication-center/read",
        "/v1/crm/sms/recipients/read",
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

    return core.response(404, {"ok": False, "error": "not_found"})
