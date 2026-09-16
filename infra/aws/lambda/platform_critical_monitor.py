import json
import os
import urllib.error
import urllib.request

import boto3

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
DR_SECRET_NAME = os.environ.get("DR_SECRET_NAME", f"/theouthaven/{ENVIRONMENT}/dr-reconciler/env")
METRIC_NAMESPACE = os.environ.get("METRIC_NAMESPACE", "TheOutHaven/Critical")
PRODUCTION_PROBE_URL = os.environ.get("PRODUCTION_PROBE_URL", "https://theouthaven.com/api/health/platform-dr")
HTTP_TIMEOUT_SECONDS = float(os.environ.get("HTTP_TIMEOUT_SECONDS", "10"))

secrets = boto3.client("secretsmanager")
cloudwatch = boto3.client("cloudwatch")


def _secret_json():
    value = secrets.get_secret_value(SecretId=DR_SECRET_NAME).get("SecretString") or "{}"
    payload = json.loads(value)
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
            "user-agent": "TheOutHaven-Critical-Monitor/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        body = json.loads(response.read().decode("utf-8"))
    if not isinstance(body, list):
        raise RuntimeError("unexpected_management_query_response")
    return body


def _production_reachable():
    try:
        request = urllib.request.Request(PRODUCTION_PROBE_URL, headers={"user-agent": "TheOutHaven-Critical-Monitor/1.0"})
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            return 1 if 200 <= int(response.status) < 500 else 0
    except Exception:
        return 0


def _metric(name, value, unit="Count"):
    return {"MetricName": name, "Value": float(value), "Unit": unit}


def _put(metrics):
    for start in range(0, len(metrics), 20):
        cloudwatch.put_metric_data(Namespace=METRIC_NAMESPACE, MetricData=metrics[start:start + 20])


def handler(event, context):
    cfg = _secret_json()
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

    source_storage, target_storage, source_replication, target_replication = [
        rows[0] if rows else {}
        for rows in [
            _management_query(token, virginia, storage_sql),
            _management_query(token, oregon, storage_sql),
            _management_query(token, virginia, source_sql),
            _management_query(token, oregon, target_sql),
        ]
    ]

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

    replication_healthy = (
        int(source_replication.get("publications") or 0) == 1
        and int(source_replication.get("slots") or 0) == 1
        and int(source_replication.get("active_slots") or 0) == 1
        and int(target_replication.get("enabled_subscriptions") or 0) == 1
        and published_tables > 0
        and int(target_replication.get("total_tables") or 0) == published_tables
        and ready_tables == published_tables
        and connected_workers >= 1
    )

    production_reachable = _production_reachable()
    metrics = [
        _metric("MonitorHeartbeat", 1),
        _metric("ProductionReachable", production_reachable),
        _metric("ReplicationHealthy", 1 if replication_healthy else 0),
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
        "ok": bool(production_reachable and replication_healthy),
        "productionReachable": bool(production_reachable),
        "replicationHealthy": replication_healthy,
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
