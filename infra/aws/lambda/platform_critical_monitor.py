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
VERCEL_SECRET_ID = os.environ.get("VERCEL_SECRET_ID", f"/theouthaven/credential-vault/{ENVIRONMENT}/vercel")
VERCEL_PROJECT_ID = os.environ.get("VERCEL_PROJECT_ID", "prj_G4nFS7P3F4cW3PQn4oQAx6Vf3GIN")

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
            "user-agent": "TheOutHaven-Critical-Monitor/1.1",
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
        request = urllib.request.Request(PRODUCTION_PROBE_URL, headers={"user-agent": "TheOutHaven-Critical-Monitor/1.1"})
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
            "user-agent": "TheOutHaven-Critical-Monitor/1.1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            return 1 if 200 <= int(response.status) < 300 else 0
    except Exception:
        return 0


def _vercel_production_healthy():
    try:
        cfg = _secret_json(VERCEL_SECRET_ID)
        token = str(cfg.get("token") or "").strip()
        team_id = str(cfg.get("teamId") or "").strip()
        if not token:
            return 0, "missing_token"
        query = {
            "projectId": VERCEL_PROJECT_ID,
            "target": "production",
            "limit": "1",
        }
        if team_id:
            query["teamId"] = team_id
        url = "https://api.vercel.com/v6/deployments?" + urllib.parse.urlencode(query)
        request = urllib.request.Request(
            url,
            headers={
                "authorization": f"Bearer {token}",
                "user-agent": "TheOutHaven-Critical-Monitor/1.1",
            },
        )
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
        deployments = payload.get("deployments") or [] if isinstance(payload, dict) else []
        if not deployments:
            return 0, "no_production_deployment"
        state = str(deployments[0].get("state") or deployments[0].get("readyState") or "UNKNOWN").upper()
        return (0 if state in {"ERROR", "CANCELED", "CANCELLED"} else 1), state
    except Exception:
        return 0, "probe_failed"


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
    vercel_healthy, vercel_state = _vercel_production_healthy()

    metrics = [
        _metric("MonitorHeartbeat", 1),
        _metric("ProductionReachable", production_reachable),
        _metric("SupabaseVirginiaHealthy", 1 if virginia_healthy else 0),
        _metric("SupabaseOregonHealthy", 1 if oregon_healthy else 0),
        _metric("ReplicationHealthy", 1 if replication_healthy else 0),
        _metric("CredentialVaultHealthy", credential_vault_healthy),
        _metric("VercelProductionHealthy", vercel_healthy),
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

    return {
        "ok": bool(
            production_reachable
            and virginia_healthy
            and oregon_healthy
            and replication_healthy
            and credential_vault_healthy
            and vercel_healthy
            and critical_cron_failures == 0
        ),
        "productionReachable": bool(production_reachable),
        "supabase": {"virginiaHealthy": virginia_healthy, "oregonHealthy": oregon_healthy},
        "replicationHealthy": replication_healthy,
        "credentialVaultHealthy": bool(credential_vault_healthy),
        "vercel": {"healthy": bool(vercel_healthy), "state": vercel_state},
        "criticalCronFailures": critical_cron_failures,
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
