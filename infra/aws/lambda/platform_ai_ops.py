import base64
import hashlib
import hmac
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import boto3

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
ASSISTANT_API_URL = os.environ.get("ASSISTANT_API_URL", "").rstrip("/")
ASSISTANT_SECRET_ARN = os.environ.get("ASSISTANT_SECRET_ARN", "")
SUPABASE_SECRET_ID = os.environ.get("SUPABASE_SECRET_ID", f"/theouthaven/credential-vault/{ENVIRONMENT}/supabase")
GITHUB_SECRET_ID = os.environ.get("GITHUB_SECRET_ID", f"/theouthaven/credential-vault/{ENVIRONMENT}/github")
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "DevSoft-Development/roseout")
AI_MODEL = os.environ.get("AI_MODEL", "gpt-5.4-mini")
AUTO_RECOVERY_EVENT = os.environ.get("AUTO_RECOVERY_EVENT", "platform-auto-recovery")
MAX_INCIDENTS = 12

secrets = boto3.client("secretsmanager")


def _secret_json(secret_id):
    raw = secrets.get_secret_value(SecretId=secret_id).get("SecretString") or "{}"
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise RuntimeError("secret_invalid_shape")
    return value


def _secret_text(secret_id):
    raw = secrets.get_secret_value(SecretId=secret_id).get("SecretString") or ""
    if not raw:
        raise RuntimeError("secret_empty")
    try:
        parsed = json.loads(raw)
    except Exception:
        return raw.strip()
    if isinstance(parsed, dict):
        return str(parsed.get("current") or parsed.get("secret") or "").strip()
    return str(parsed).strip()


def _supabase():
    value = _secret_json(SUPABASE_SECRET_ID)
    url = str(value.get("url") or "").strip().rstrip("/")
    key = str(value.get("secretKey") or value.get("serviceRoleKey") or "").strip()
    if not url or not key:
        raise RuntimeError("supabase_server_credential_missing")
    return url, key


def _request_json(url, method="GET", headers=None, body=None, timeout=20):
    payload = None if body is None else json.dumps(body, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(url, method=method, data=payload, headers=headers or {})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8", errors="replace")
        return int(response.status), json.loads(raw) if raw else None


def _supabase_get(path, query):
    url, key = _supabase()
    qs = urllib.parse.urlencode(query, doseq=True)
    status, data = _request_json(
        f"{url}/rest/v1/{path}?{qs}",
        headers={"apikey": key, "authorization": f"Bearer {key}", "accept": "application/json"},
    )
    if status != 200:
        raise RuntimeError(f"supabase_read_http_{status}")
    return data if isinstance(data, list) else []


def _persist(category, level, message, metadata):
    url, key = _supabase()
    status, _ = _request_json(
        f"{url}/rest/v1/admin_system_logs",
        method="POST",
        headers={
            "apikey": key,
            "authorization": f"Bearer {key}",
            "content-type": "application/json",
            "prefer": "return=minimal",
        },
        body={
            "category": category,
            "level": level,
            "message": message,
            "source": "aws-ai-ops-controller",
            "metadata": metadata,
        },
    )
    if status not in (200, 201, 204):
        raise RuntimeError(f"supabase_persist_http_{status}")


def _assistant_analysis(context):
    if not ASSISTANT_API_URL or not ASSISTANT_SECRET_ARN:
        return {"source": "rules", "summary": "AI assistant not configured; deterministic policy evaluated the incident.", "recommended_actions": []}
    secret = _secret_text(ASSISTANT_SECRET_ARN)
    path = "/v1/openai/responses"
    body = {
        "model": AI_MODEL,
        "input": [
            {
                "role": "system",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "You are TheOutHaven production incident diagnostician. "
                            "Return concise JSON only with keys summary, likely_cause, impact, recommended_actions, confidence. "
                            "Never recommend database failover, credential deletion, user lockout, or arbitrary code execution. "
                            "You may recommend only observe, rollback_azure_consumer, investigate, rotate_guarded_credential."
                        ),
                    }
                ],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": json.dumps(context, separators=(",", ":"), default=str)[:12000]}],
            },
        ],
    }
    raw = json.dumps(body, separators=(",", ":"))
    timestamp = str(int(time.time() * 1000))
    canonical = "\n".join([timestamp, "POST", path, raw])
    signature = hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    try:
        status, data = _request_json(
            f"{ASSISTANT_API_URL}{path}",
            method="POST",
            headers={
                "content-type": "application/json",
                "x-toh-timestamp": timestamp,
                "x-toh-signature": signature,
            },
            body=body,
            timeout=55,
        )
        if status < 200 or status >= 300 or not isinstance(data, dict):
            raise RuntimeError(f"assistant_http_{status}")
        text = ""
        for item in data.get("output") or []:
            for content in item.get("content") or []:
                if content.get("type") == "output_text":
                    text = str(content.get("text") or "")
                    break
            if text:
                break
        parsed = json.loads(text) if text else {}
        if not isinstance(parsed, dict):
            parsed = {}
        return {"source": "assistant-api", **parsed}
    except Exception as error:
        return {
            "source": "rules",
            "summary": "AI diagnosis unavailable; deterministic policy evaluated the incident.",
            "ai_error": type(error).__name__,
            "recommended_actions": [],
        }


def _latest_context():
    incidents = _supabase_get(
        "admin_system_logs",
        {
            "category": "eq.critical_alert",
            "select": "id,level,message,metadata,created_at",
            "order": "created_at.desc",
            "limit": str(MAX_INCIDENTS),
        },
    )
    releases = _supabase_get(
        "platform_releases",
        {
            "environment": "eq.production",
            "select": "release_id,git_sha,surface,provider,state,previous_good_release_id,updated_at,rollback_reason",
            "order": "updated_at.desc",
            "limit": "30",
        },
    )
    latest = {}
    for row in releases:
        key = f"{row.get('provider')}:{row.get('surface')}"
        latest.setdefault(key, row)
    return incidents, list(latest.values())


def _deterministic_decision(incidents, releases):
    azure = next((r for r in releases if r.get("provider") == "azure" and r.get("surface") == "consumer"), None)
    open_incidents = [
        row for row in incidents
        if str((row.get("metadata") or {}).get("state") or ("open" if row.get("level") == "critical" else "recovered")).lower() == "open"
    ]
    if azure and azure.get("state") in {"FAILED", "DEGRADED"} and azure.get("previous_good_release_id"):
        return {
            "action": "rollback_azure_consumer",
            "auto_allowed": True,
            "release_id": azure.get("release_id"),
            "reason": f"Azure consumer release is {azure.get('state')} with a previous-good pointer.",
            "open_incidents": len(open_incidents),
        }
    return {
        "action": "observe",
        "auto_allowed": False,
        "release_id": azure.get("release_id") if azure else None,
        "reason": "No deterministic allowlisted self-heal condition is currently satisfied.",
        "open_incidents": len(open_incidents),
    }


def _already_dispatched(release_id):
    if not release_id:
        return False
    rows = _supabase_get(
        "platform_release_events",
        {
            "release_id": f"eq.{release_id}",
            "event_type": "eq.auto_recovery_dispatched",
            "select": "event_id",
            "limit": "1",
        },
    )
    return bool(rows)


def _dispatch_recovery(release_id):
    value = _secret_json(GITHUB_SECRET_ID)
    token = str(value.get("token") or "").strip()
    if not token:
        raise RuntimeError("github_runtime_token_missing")
    status, _ = _request_json(
        f"https://api.github.com/repos/{GITHUB_REPOSITORY}/dispatches",
        method="POST",
        headers={
            "authorization": f"Bearer {token}",
            "accept": "application/vnd.github+json",
            "content-type": "application/json",
            "user-agent": "TheOutHaven-AI-Ops/1.0",
            "x-github-api-version": "2022-11-28",
        },
        body={
            "event_type": AUTO_RECOVERY_EVENT,
            "client_payload": {"scope": "azure-consumer", "release_id": release_id, "source": "aws-ai-ops-controller"},
        },
    )
    if status not in (200, 201, 202, 204):
        raise RuntimeError(f"github_dispatch_http_{status}")


def handler(event, context):
    incidents, releases = _latest_context()
    decision = _deterministic_decision(incidents, releases)
    analysis = _assistant_analysis({"decision": decision, "incidents": incidents, "releases": releases})
    dispatched = False
    dispatch_error = None

    if decision["auto_allowed"] and decision["action"] == "rollback_azure_consumer":
        release_id = str(decision.get("release_id") or "")
        if release_id and not _already_dispatched(release_id):
            try:
                _dispatch_recovery(release_id)
                dispatched = True
            except Exception as error:
                dispatch_error = type(error).__name__

    metadata = {
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "policy_version": 1,
        "decision": decision,
        "analysis": analysis,
        "auto_recovery_dispatched": dispatched,
        "dispatch_error": dispatch_error,
        "guardrails": {
            "database_failover": "operator_only",
            "human_root_lockout": "operator_only",
            "arbitrary_code_execution": "disabled",
            "allowed_auto_action": "azure_consumer_previous_good_rollback",
        },
    }
    _persist("ai_ops_analysis", "warning" if decision["auto_allowed"] else "info", "AI-assisted production operations evaluation", metadata)
    print(json.dumps(metadata, separators=(",", ":"), default=str))
    return {"ok": dispatch_error is None, **metadata}
