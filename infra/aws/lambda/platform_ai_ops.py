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
PLATFORM_ALERTS_TOPIC_ARN = os.environ.get("PLATFORM_ALERTS_TOPIC_ARN", "")
CISA_KEV_URL = os.environ.get("CISA_KEV_URL", "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json")
MAX_INCIDENTS = 12
MAX_SECURITY_ALERTS = 100

secrets = boto3.client("secretsmanager")
sns = boto3.client("sns")


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



def _github_headers():
    value = _secret_json(GITHUB_SECRET_ID)
    token = str(value.get("token") or "").strip()
    if not token:
        raise RuntimeError("github_runtime_token_missing")
    return {
        "authorization": f"Bearer {token}",
        "accept": "application/vnd.github+json",
        "user-agent": "TheOutHaven-Security-Intelligence/1.0",
        "x-github-api-version": "2022-11-28",
    }


def _github_dependabot_alerts():
    status, data = _request_json(
        f"https://api.github.com/repos/{GITHUB_REPOSITORY}/dependabot/alerts?state=open&per_page={MAX_SECURITY_ALERTS}",
        headers=_github_headers(),
        timeout=30,
    )
    if status != 200 or not isinstance(data, list):
        raise RuntimeError(f"github_dependabot_http_{status}")
    return data


def _cisa_kev():
    status, data = _request_json(
        CISA_KEV_URL,
        headers={"user-agent": "TheOutHaven-Security-Intelligence/1.0"},
        timeout=30,
    )
    if status != 200 or not isinstance(data, dict):
        raise RuntimeError(f"cisa_kev_http_{status}")
    vulnerabilities = data.get("vulnerabilities") or []
    return {
        str(row.get("cveID") or "").upper(): row
        for row in vulnerabilities
        if isinstance(row, dict) and row.get("cveID")
    }


def _recent_security_advisory_ids():
    rows = _supabase_get(
        "admin_system_logs",
        {
            "category": "eq.security_intelligence",
            "select": "metadata,created_at",
            "order": "created_at.desc",
            "limit": "100",
        },
    )
    known = set()
    for row in rows:
        metadata = row.get("metadata") or {}
        for finding in metadata.get("findings") or []:
            advisory_id = str((finding or {}).get("advisory_id") or "").strip()
            if advisory_id:
                known.add(advisory_id)
    return known


def _security_findings():
    alerts = _github_dependabot_alerts()
    kev = _cisa_kev()
    findings = []
    for alert in alerts:
        advisory = alert.get("security_advisory") or {}
        dependency = alert.get("dependency") or {}
        package = dependency.get("package") or {}
        cve = str(advisory.get("cve_id") or "").upper()
        cvss = advisory.get("cvss") or {}
        score = float(cvss.get("score") or 0)
        severity = str(advisory.get("severity") or "unknown").lower()
        exploited = cve in kev if cve else False
        deterministic_priority = "critical" if exploited or severity == "critical" or score >= 9 else "high" if severity == "high" or score >= 7 else "medium"
        first_patched = (alert.get("security_vulnerability") or {}).get("first_patched_version") or {}
        findings.append(
            {
                "advisory_id": str(advisory.get("ghsa_id") or cve or alert.get("number") or ""),
                "cve": cve or None,
                "package": package.get("name"),
                "ecosystem": package.get("ecosystem"),
                "manifest_path": dependency.get("manifest_path"),
                "scope": dependency.get("scope"),
                "severity": severity,
                "cvss_score": score,
                "known_exploited": exploited,
                "cisa_due_date": (kev.get(cve) or {}).get("dueDate") if exploited else None,
                "cisa_required_action": (kev.get(cve) or {}).get("requiredAction") if exploited else None,
                "patched_version": first_patched.get("identifier"),
                "summary": advisory.get("summary"),
                "html_url": alert.get("html_url"),
                "priority": deterministic_priority,
                "auto_patch_policy": "dependabot_pr_only",
            }
        )
    findings.sort(key=lambda row: (row["priority"] != "critical", row["priority"] != "high", -(row.get("cvss_score") or 0)))
    return findings


def _notify_security_intelligence(findings, new_ids):
    if not PLATFORM_ALERTS_TOPIC_ARN or not new_ids:
        return False
    urgent = [row for row in findings if row.get("advisory_id") in new_ids and row.get("priority") in {"critical", "high"}]
    if not urgent:
        return False
    lines = [
        f"{row.get('priority','unknown').upper()} {row.get('advisory_id')} {row.get('package') or 'unknown package'}"
        + (" [CISA KEV]" if row.get("known_exploited") else "")
        for row in urgent[:10]
    ]
    sns.publish(
        TopicArn=PLATFORM_ALERTS_TOPIC_ARN,
        Subject="TheOutHaven security intelligence alert"[:100],
        Message="New affected dependency vulnerabilities detected:\n" + "\n".join(lines),
    )
    return True


def _security_intelligence():
    evaluated_at = datetime.now(timezone.utc).isoformat()
    try:
        findings = _security_findings()
        known = _recent_security_advisory_ids()
        current_ids = {row.get("advisory_id") for row in findings if row.get("advisory_id")}
        new_ids = sorted(current_ids - known)
        urgent = [row for row in findings if row.get("priority") in {"critical", "high"}]
        exploited = [row for row in findings if row.get("known_exploited")]
        analysis = _assistant_analysis(
            {
                "mode": "security_intelligence",
                "policy": {
                    "ai_role": "diagnosis_and_recommendation_only",
                    "automatic_patch": "dependabot_pr_only",
                    "iam_changes": "operator_only",
                    "database_failover": "operator_only",
                    "credential_rotation": "guarded_workflow_only",
                },
                "findings": findings[:25],
            }
        )
        notified = _notify_security_intelligence(findings, set(new_ids))
        metadata = {
            "evaluated_at": evaluated_at,
            "policy_version": 1,
            "source": "github_dependabot+cisa_kev",
            "affected_open_alerts": len(findings),
            "urgent_count": len(urgent),
            "known_exploited_count": len(exploited),
            "new_advisory_ids": new_ids,
            "findings": findings[:50],
            "analysis": analysis,
            "notification_sent": notified,
            "guardrails": {
                "ai_can_patch_directly": False,
                "automatic_patch_path": "dependabot_pr_then_existing_ci_canary_rollback",
                "database_failover": "operator_only",
                "iam_trust_changes": "operator_only",
                "human_root_lockout": "operator_only",
                "arbitrary_code_execution": "disabled",
            },
        }
        level = "critical" if exploited else "warning" if urgent else "info"
        _persist("security_intelligence", level, "AI security intelligence evaluation", metadata)
        return {"ok": True, "mode": "security_intelligence", **metadata}
    except Exception as error:
        metadata = {
            "evaluated_at": evaluated_at,
            "policy_version": 1,
            "source": "github_dependabot+cisa_kev",
            "error": type(error).__name__,
            "guardrails": {"security_feed_failure": "alert_and_retry", "ai_can_patch_directly": False},
        }
        _persist("security_intelligence", "warning", "Security intelligence feed evaluation failed", metadata)
        return {"ok": False, "mode": "security_intelligence", **metadata}



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
    mode = str((event or {}).get("mode") or "operations").strip().lower()
    if mode == "security_intelligence":
        return _security_intelligence()

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
