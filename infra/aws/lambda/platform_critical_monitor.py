import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

import boto3

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
DR_SECRET_NAME = os.environ.get("DR_SECRET_NAME", f"/theouthaven/{ENVIRONMENT}/dr-reconciler/env")
METRIC_NAMESPACE = os.environ.get("METRIC_NAMESPACE", "TheOutHaven/Critical")
PRODUCTION_PROBE_URL = os.environ.get("PRODUCTION_PROBE_URL", "https://theouthaven.com/api/health/platform-dr")
HTTP_TIMEOUT_SECONDS = float(os.environ.get("HTTP_TIMEOUT_SECONDS", "10"))
CREDENTIAL_VAULT_GATEWAY_URL = os.environ.get("CREDENTIAL_VAULT_GATEWAY_URL", "").rstrip("/")
CREDENTIAL_VAULT_GATEWAY_SECRET = os.environ.get("CREDENTIAL_VAULT_GATEWAY_SECRET", "")
GITHUB_SECRET_ID = os.environ.get("GITHUB_SECRET_ID", f"/theouthaven/credential-vault/{ENVIRONMENT}/github")
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "DevSoft-Development/roseout")
AUTO_RECOVERY_WINDOW_MINUTES = int(os.environ.get("AUTO_RECOVERY_WINDOW_MINUTES", "30"))
STORAGE_DRIFT_CRITICAL_BYTES = int(os.environ.get("STORAGE_DRIFT_CRITICAL_BYTES", "5368709120"))
WAL_LAG_CRITICAL_BYTES = int(os.environ.get("WAL_LAG_CRITICAL_BYTES", "536870912"))

secrets = boto3.client("secretsmanager")
cloudwatch = boto3.client("cloudwatch")


def _secret_json(secret_id=DR_SECRET_NAME):
    value = secrets.get_secret_value(SecretId=secret_id).get("SecretString") or "{}"
    payload = json.loads(value)
    if not isinstance(payload, dict):
        raise RuntimeError("secret_payload_invalid")
    return payload


def _dr_config():
    payload = _secret_json(DR_SECRET_NAME)
    required = ["DR_SUPABASE_ACCESS_TOKEN", "DR_VIRGINIA_REF", "DR_OREGON_REF"]
    missing = [key for key in required if not str(payload.get(key) or "").strip()]
    if missing:
        raise RuntimeError("missing_dr_monitor_config:" + ",".join(missing))
    return payload


def _management_query(token, project_ref, sql):
    request = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
        method="POST",
        data=json.dumps({"query": sql}).encode("utf-8"),
        headers={
            "authorization": f"Bearer {token}",
            "content-type": "application/json",
            "user-agent": "TheOutHaven-Critical-Monitor/1.2",
        },
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        body = json.loads(response.read().decode("utf-8"))
    if not isinstance(body, list):
        raise RuntimeError("unexpected_management_query_response")
    return body


def _safe_management_query(token, project_ref, sql):
    try:
        return _management_query(token, project_ref, sql), True
    except Exception:
        return [], False


def _production_reachable():
    try:
        request = urllib.request.Request(PRODUCTION_PROBE_URL, headers={"user-agent": "TheOutHaven-Critical-Monitor/1.2"})
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            return 1 if 200 <= int(response.status) < 500 else 0
    except Exception:
        return 0


def _credential_vault_healthy():
    if not CREDENTIAL_VAULT_GATEWAY_URL or not CREDENTIAL_VAULT_GATEWAY_SECRET:
        return 0
    path = f"/v1/credentials/runtime?environment={urllib.parse.quote(ENVIRONMENT)}"
    timestamp = str(int(time.time() * 1000))
    payload = "\n".join([timestamp, "GET", path, ""])
    signature = hmac.new(CREDENTIAL_VAULT_GATEWAY_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    request = urllib.request.Request(
        f"{CREDENTIAL_VAULT_GATEWAY_URL}{path}",
        method="GET",
        headers={
            "x-toh-timestamp": timestamp,
            "x-toh-signature": signature,
            "user-agent": "TheOutHaven-Critical-Monitor/1.2",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            return 1 if 200 <= int(response.status) < 300 else 0
    except Exception:
        return 0


def _github_token():
    cfg = _secret_json(GITHUB_SECRET_ID)
    token = str(cfg.get("token") or "").strip()
    if not token:
        raise RuntimeError("github_recovery_token_missing")
    return token


def _dispatch_auto_recovery(token, release_id):
    body = json.dumps({
        "event_type": "platform-auto-recovery",
        "client_payload": {
            "scope": "azure-consumer",
            "release_id": release_id,
            "source": "critical-platform-monitor",
        },
    }).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.github.com/repos/{GITHUB_REPOSITORY}/dispatches",
        method="POST",
        data=body,
        headers={
            "authorization": f"Bearer {token}",
            "accept": "application/vnd.github+json",
            "content-type": "application/json",
            "user-agent": "TheOutHaven-Critical-Monitor/1.3",
            "x-github-api-version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        if int(response.status) not in (200, 201, 202, 204):
            raise RuntimeError(f"github_recovery_dispatch_failed:{response.status}")


def _auto_recovery_candidate(token, project_ref):
    sql = f"""
      with latest as (
        select release_id, git_sha, previous_good_release_id, state, promoted_at
        from public.platform_releases
        where surface = 'consumer'
          and provider = 'azure'
          and environment = 'production'
        order by promoted_at desc nulls last, created_at desc
        limit 1
      )
      select
        latest.release_id,
        latest.git_sha,
        latest.previous_good_release_id,
        latest.state,
        latest.promoted_at,
        latest.promoted_at >= now() - interval '{AUTO_RECOVERY_WINDOW_MINUTES} minutes' as within_window,
        not exists (
          select 1
          from public.platform_release_events e
          where e.release_id = latest.release_id
            and e.event_type in ('auto_recovery_requested','auto_recovery_dispatched')
        ) as not_dispatched
      from latest;
    """
    rows, ok = _safe_management_query(token, project_ref, sql)
    return (rows[0] if rows else {}), ok


def _record_auto_recovery_request(token, project_ref, release_id):
    sql = f"""
      insert into public.platform_release_events(
        release_id, event_type, source, provider, actor, reason, evidence
      )
      values (
        {_sql_literal(release_id)},
        'auto_recovery_requested',
        'critical-platform-monitor',
        'azure',
        'automation',
        'recent_release_production_outage',
        '{{"scope":"azure-consumer","detector":"production-health","window_minutes":{AUTO_RECOVERY_WINDOW_MINUTES}}}'::jsonb
      );
    """
    _management_query(token, project_ref, sql)


def _sql_literal(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def _record_incident_transitions(token, project_ref, incidents):
    if not incidents:
        return True

    rows = []
    for incident in incidents:
        state = "open" if incident.get("active") else "recovered"
        metadata = {
            "incident_key": incident["key"],
            "state": state,
            "title": incident["title"],
            "detail": incident.get("detail") or "",
            "environment": ENVIRONMENT,
        }
        rows.append(
            "(" + ",".join([
                _sql_literal(incident["key"]),
                _sql_literal(state),
                _sql_literal(incident["title"]),
                _sql_literal(incident.get("detail") or ""),
                _sql_literal(json.dumps(metadata, separators=(",", ":"))),
            ]) + ")"
        )

    sql = f"""
      with current(incident_key, state, title, detail, metadata_text) as (
        values {','.join(rows)}
      ),
      latest as (
        select distinct on (metadata->>'incident_key')
          metadata->>'incident_key' as incident_key,
          metadata->>'state' as state
        from public.admin_system_logs
        where category = 'critical_alert'
          and source = 'critical-platform-monitor'
        order by metadata->>'incident_key', created_at desc
      ),
      changed as (
        select current.*
        from current
        left join latest using (incident_key)
        where (latest.state is null and current.state = 'open')
           or (latest.state is not null and latest.state is distinct from current.state)
      ),
      inserted as (
        insert into public.admin_system_logs(category, level, message, source, metadata)
        select
          'critical_alert',
          case when state = 'open' then 'critical' else 'info' end,
          title || ': ' || upper(state),
          'critical-platform-monitor',
          metadata_text::jsonb
        from changed
        returning id
      )
      select count(*)::bigint as inserted_count from inserted;
    """
    _management_query(token, project_ref, sql)
    return True


def _metric(name, value, unit="Count"):
    return {"MetricName": name, "Value": float(value), "Unit": unit}


def _put(metrics):
    for start in range(0, len(metrics), 20):
        cloudwatch.put_metric_data(Namespace=METRIC_NAMESPACE, MetricData=metrics[start:start + 20])


def handler(event, context):
    cfg = _dr_config()
    token = cfg["DR_SUPABASE_ACCESS_TOKEN"]
    virginia = cfg["DR_VIRGINIA_REF"]
    oregon = cfg["DR_OREGON_REF"]

    storage_sql = """
      select
        count(*)::bigint as object_count,
        coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0)::bigint as total_bytes
      from storage.objects;
    """
    source_sql = """
      select
        (select count(*) from pg_publication where pubname='theouthaven_dr_publication') as publications,
        (select count(*) from pg_publication_tables where pubname='theouthaven_dr_publication') as published_tables,
        (select count(*) from pg_replication_slots where slot_name='theouthaven_va_to_or_dr_slot') as slots,
        (select count(*) from pg_replication_slots where slot_name='theouthaven_va_to_or_dr_slot' and active) as active_slots,
        coalesce((select pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)::bigint from pg_replication_slots where slot_name='theouthaven_va_to_or_dr_slot'),0)::bigint as wal_lag_bytes;
    """
    target_sql = """
      select
        (select count(*) from pg_subscription where subname='theouthaven_va_to_or_dr' and subenabled) as enabled_subscriptions,
        (select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='theouthaven_va_to_or_dr') as total_tables,
        (select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='theouthaven_va_to_or_dr' and sr.srsubstate='r') as ready_tables,
        (select count(*) from pg_stat_subscription where subname='theouthaven_va_to_or_dr' and pid is not null) as connected_workers;
    """
    cron_sql = """
      with latest as (
        select
          job_key,
          status,
          error_message,
          created_at,
          row_number() over (partition by job_key order by created_at desc) as rn
        from public.cron_job_runs
        where created_at >= now() - interval '2 hours'
      )
      select count(*)::bigint as critical_failures
      from latest
      where rn = 1
        and job_key <> 'cron-alert-dispatcher'
        and (lower(coalesce(status,'')) in ('failed','error','failure') or nullif(error_message,'') is not null);
    """

    source_storage_rows, source_storage_ok = _safe_management_query(token, virginia, storage_sql)
    target_storage_rows, target_storage_ok = _safe_management_query(token, oregon, storage_sql)
    source_replication_rows, source_replication_ok = _safe_management_query(token, virginia, source_sql)
    target_replication_rows, target_replication_ok = _safe_management_query(token, oregon, target_sql)
    cron_rows, cron_query_ok = _safe_management_query(token, virginia, cron_sql)

    source_storage = source_storage_rows[0] if source_storage_rows else {}
    target_storage = target_storage_rows[0] if target_storage_rows else {}
    source_replication = source_replication_rows[0] if source_replication_rows else {}
    target_replication = target_replication_rows[0] if target_replication_rows else {}
    cron_status = cron_rows[0] if cron_rows else {}

    virginia_healthy = bool(source_storage_ok and source_replication_ok and cron_query_ok)
    oregon_healthy = bool(target_storage_ok and target_replication_ok)

    source_objects = int(source_storage.get("object_count") or 0)
    target_objects = int(target_storage.get("object_count") or 0)
    source_bytes = int(source_storage.get("total_bytes") or 0)
    target_bytes = int(target_storage.get("total_bytes") or 0)
    byte_drift = abs(source_bytes - target_bytes)
    object_drift = abs(source_objects - target_objects)
    published_tables = int(source_replication.get("published_tables") or 0)
    ready_tables = int(target_replication.get("ready_tables") or 0)
    ready_gap = max(0, published_tables - ready_tables)
    connected_workers = int(target_replication.get("connected_workers") or 0)
    wal_lag = int(source_replication.get("wal_lag_bytes") or 0)
    critical_cron_failures = int(cron_status.get("critical_failures") or 0) if cron_query_ok else 1

    replication_healthy = (
        virginia_healthy
        and oregon_healthy
        and int(source_replication.get("publications") or 0) == 1
        and int(source_replication.get("slots") or 0) == 1
        and int(source_replication.get("active_slots") or 0) == 1
        and int(target_replication.get("enabled_subscriptions") or 0) == 1
        and published_tables > 0
        and int(target_replication.get("total_tables") or 0) == published_tables
        and ready_tables == published_tables
        and connected_workers >= 1
    )

    production_reachable = _production_reachable()
    credential_vault_healthy = _credential_vault_healthy()
    recovery_candidate, recovery_query_ok = _auto_recovery_candidate(token, virginia)
    recovery_dispatched = False
    recovery_error = ""
    if (
        not production_reachable
        and recovery_query_ok
        and recovery_candidate.get("release_id")
        and recovery_candidate.get("previous_good_release_id")
        and recovery_candidate.get("state") in {"STABLE", "DEGRADED"}
        and bool(recovery_candidate.get("within_window"))
        and bool(recovery_candidate.get("not_dispatched"))
    ):
        try:
            _dispatch_auto_recovery(_github_token(), recovery_candidate["release_id"])
            _record_auto_recovery_request(token, virginia, recovery_candidate["release_id"])
            recovery_dispatched = True
        except Exception as exc:
            recovery_error = str(exc)[:500]

    metrics = [
        _metric("MonitorHeartbeat", 1),
        _metric("ProductionReachable", production_reachable),
        _metric("SupabaseVirginiaHealthy", 1 if virginia_healthy else 0),
        _metric("SupabaseOregonHealthy", 1 if oregon_healthy else 0),
        _metric("ReplicationHealthy", 1 if replication_healthy else 0),
        _metric("CredentialVaultHealthy", credential_vault_healthy),
        _metric("AutoRecoveryEligible", 1 if recovery_candidate.get("within_window") else 0),
        _metric("AutoRecoveryDispatched", 1 if recovery_dispatched else 0),
        _metric("CriticalCronFailures", critical_cron_failures),
        _metric("StorageByteDrift", byte_drift, "Bytes"),
        _metric("StorageObjectDrift", object_drift),
        _metric("WalLagBytes", wal_lag, "Bytes"),
        _metric("ReadyTableGap", ready_gap),
        _metric("ConnectedWorkers", connected_workers),
        _metric("VirginiaStorageBytes", source_bytes, "Bytes"),
        _metric("OregonStorageBytes", target_bytes, "Bytes"),
        _metric("VirginiaStorageObjects", source_objects),
        _metric("OregonStorageObjects", target_objects),
    ]
    _put(metrics)

    incidents = [
        {
            "key": "production_outage",
            "title": "Production availability",
            "active": not bool(production_reachable),
            "detail": "The public production health probe is unreachable." if not production_reachable else "The public production health probe recovered.",
        },
        {
            "key": "supabase_virginia",
            "title": "Supabase Virginia primary",
            "active": not virginia_healthy,
            "detail": "Virginia primary health queries are failing." if not virginia_healthy else "Virginia primary health queries recovered.",
        },
        {
            "key": "supabase_oregon",
            "title": "Supabase Oregon standby",
            "active": not oregon_healthy,
            "detail": "Oregon standby health queries are failing." if not oregon_healthy else "Oregon standby health queries recovered.",
        },
        {
            "key": "dr_replication",
            "title": "Virginia to Oregon replication",
            "active": not replication_healthy,
            "detail": f"Replication health: ready tables {ready_tables}/{published_tables}, connected workers {connected_workers}." if not replication_healthy else "Virginia to Oregon replication recovered.",
        },
        {
            "key": "credential_vault",
            "title": "Credential Vault gateway",
            "active": not bool(credential_vault_healthy),
            "detail": "Credential Vault runtime gateway is unavailable, rate limited, or returning errors." if not credential_vault_healthy else "Credential Vault runtime gateway recovered.",
        },
        {
            "key": "critical_cron_failures",
            "title": "Critical cron jobs",
            "active": critical_cron_failures > 0,
            "detail": f"{critical_cron_failures} tracked cron job(s) have an unresolved recent failure." if critical_cron_failures else "Tracked cron jobs recovered.",
        },
        {
            "key": "dr_storage_byte_drift",
            "title": "Oregon storage byte drift",
            "active": byte_drift > STORAGE_DRIFT_CRITICAL_BYTES,
            "detail": f"Virginia and Oregon storage differ by {byte_drift} bytes; critical threshold is {STORAGE_DRIFT_CRITICAL_BYTES} bytes." if byte_drift > STORAGE_DRIFT_CRITICAL_BYTES else "Storage byte drift returned below the critical threshold.",
        },
        {
            "key": "dr_wal_lag",
            "title": "Oregon replication WAL lag",
            "active": wal_lag > WAL_LAG_CRITICAL_BYTES,
            "detail": f"WAL lag is {wal_lag} bytes; critical threshold is {WAL_LAG_CRITICAL_BYTES} bytes." if wal_lag > WAL_LAG_CRITICAL_BYTES else "WAL lag returned below the critical threshold.",
        },
    ]

    incident_history_recorded = True
    try:
        _record_incident_transitions(token, virginia, incidents)
    except Exception:
        # Incident-history persistence must never hide or prevent the live CloudWatch health signal.
        incident_history_recorded = False

    return {
        "ok": bool(
            production_reachable
            and virginia_healthy
            and oregon_healthy
            and replication_healthy
            and credential_vault_healthy
            and critical_cron_failures == 0
        ),
        "productionReachable": bool(production_reachable),
        "supabase": {"virginiaHealthy": virginia_healthy, "oregonHealthy": oregon_healthy},
        "replicationHealthy": replication_healthy,
        "credentialVaultHealthy": bool(credential_vault_healthy),
        "autoRecovery": {
            "eligible": bool(recovery_candidate.get("within_window")),
            "releaseId": recovery_candidate.get("release_id"),
            "previousGoodReleaseId": recovery_candidate.get("previous_good_release_id"),
            "dispatched": recovery_dispatched,
            "error": recovery_error,
        },
        "criticalCronFailures": critical_cron_failures,
        "incidentHistoryRecorded": incident_history_recorded,
        "storage": {
            "virginiaBytes": source_bytes,
            "oregonBytes": target_bytes,
            "byteDrift": byte_drift,
            "virginiaObjects": source_objects,
            "oregonObjects": target_objects,
            "objectDrift": object_drift,
        },
        "replication": {
            "walLagBytes": wal_lag,
            "publishedTables": published_tables,
            "readyTables": ready_tables,
            "readyTableGap": ready_gap,
            "connectedWorkers": connected_workers,
        },
    }
