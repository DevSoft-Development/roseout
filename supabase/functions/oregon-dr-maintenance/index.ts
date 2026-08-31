// @ts-nocheck
import postgres from "npm:postgres@3.4.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { DynamoDBClient } from "npm:@aws-sdk/client-dynamodb@3.864.0";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "npm:@aws-sdk/lib-dynamodb@3.864.0";

const PUBLICATION = "theouthaven_dr_publication";
const SUBSCRIPTION = "theouthaven_va_to_or_dr";
const SLOT = "theouthaven_va_to_or_dr_slot";

const AUTH_SCHEMA_SQL = `
with cols as (
  select c.relname as table_name,
         a.attname,
         format_type(a.atttypid,a.atttypmod) as data_type,
         a.attnotnull,
         a.attidentity::text as attidentity,
         a.attgenerated::text as attgenerated
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  where c.relkind='r' and n.nspname='auth'
)
select count(distinct table_name) as table_count,
       count(*) as column_count,
       md5(string_agg(table_name||':'||attname||':'||data_type||':'||attnotnull::text||':'||attidentity||':'||attgenerated,'|' order by table_name,attname)) as schema_fingerprint,
       (select count(*) from auth.schema_migrations) as migration_count,
       (select md5(coalesce(string_agg(version::text,',' order by version::text),'')) from auth.schema_migrations) as migration_fingerprint
from cols`;

const AUTH_DATA_SQL = `
with rels as (
  select c.relname as table_name, q.row_count, q.row_fingerprint
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  cross join lateral (
    select (xpath('/row/c/text()', x))[1]::text::bigint as row_count,
           (xpath('/row/h/text()', x))[1]::text as row_fingerprint
    from (
      select query_to_xml(
        format('select count(*) as c, coalesce(sum(hashtextextended(to_jsonb(t)::text,0)::numeric),0) as h from %I.%I t', n.nspname, c.relname),
        false, true, ''
      ) as x
    ) s
  ) q
  where c.relkind='r' and n.nspname='auth' and c.relname <> 'schema_migrations'
)
select count(*) as table_count,
       sum(row_count) as total_rows,
       md5(string_agg(table_name||':'||row_count::text||':'||row_fingerprint,'|' order by table_name)) as data_fingerprint,
       (select md5(coalesce(string_agg(version::text,',' order by version::text),'')) from auth.schema_migrations) as migration_fingerprint
from rels`;

const AUTH_COLUMNS_SQL = `
select c.relname as table_name,
       a.attname as column_name,
       a.attgenerated::text as generated_kind
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
where c.relkind='r' and n.nspname='auth' and c.relname <> 'schema_migrations'
order by c.relname,a.attnum`;

const STORAGE_BUCKET_SQL = `
select count(*) as buckets,
       md5(coalesce(string_agg(id||':'||public::text||':'||coalesce(file_size_limit::text,'')||':'||coalesce(array_to_string(allowed_mime_types,','),''),'|' order by id),'')) as bucket_fingerprint
from storage.buckets`;

const STORAGE_MANIFEST_SQL = `
select bucket_id,
       name,
       coalesce(metadata->>'eTag','') as etag,
       coalesce((metadata->>'size')::bigint,0) as size,
       coalesce(metadata->>'mimetype','application/octet-stream') as mimetype,
       coalesce(metadata->>'cacheControl','3600') as cache_control
from storage.objects
order by bucket_id,name`;

const STORAGE_SUMMARY_SQL = `
select count(*) as objects,
       coalesce(sum((metadata->>'size')::bigint),0) as bytes,
       md5(coalesce(string_agg(bucket_id||'/'||name||':'||coalesce(metadata->>'eTag','')||':'||coalesce(metadata->>'size','0'),'|' order by bucket_id,name),'')) as manifest_fingerprint
from storage.objects`;

function required(name: string): string {
  const value = Deno.env.get(name) || "";
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function qident(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) => typeof v === "bigint" ? v.toString() : v);
}

function sameRow(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

function normalizeEtag(value: unknown): string {
  return String(value ?? "").trim().replace(/^"|"$/g, "").toLowerCase();
}

function objectKey(row: any): string {
  return JSON.stringify([String(row.bucket_id), String(row.name)]);
}

function sqlClient(url: string) {
  return postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 5,
    max_lifetime: 60,
    ssl: "require",
  });
}

async function one(client: any, sql: string): Promise<any> {
  const rows = await client.unsafe(sql);
  if (!rows?.length) throw new Error("expected_query_row_missing");
  return rows[0];
}

async function authFingerprint(client: any): Promise<any> {
  return await one(client, AUTH_DATA_SQL);
}

async function verifyAuthSchema(source: any, target: any) {
  const [a, b] = await Promise.all([one(source, AUTH_SCHEMA_SQL), one(target, AUTH_SCHEMA_SQL)]);
  if (!sameRow(a, b)) throw new Error("auth_schema_or_migration_mismatch");
  return a;
}

async function captureAuthSnapshot(client: any) {
  await client.unsafe("begin isolation level repeatable read read only");
  try {
    const fingerprint = await one(client, AUTH_DATA_SQL);
    const columnRows = await client.unsafe(AUTH_COLUMNS_SQL);
    const tableMap = new Map<string, { name: string; columns: string[] }>();
    for (const row of columnRows) {
      const name = String(row.table_name);
      if (!tableMap.has(name)) tableMap.set(name, { name, columns: [] });
      if (String(row.generated_kind || "") === "") tableMap.get(name)!.columns.push(String(row.column_name));
    }

    const tables: any[] = [];
    for (const meta of [...tableMap.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      const payloadRow = await one(
        client,
        `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)::text as payload from auth.${qident(meta.name)} t`,
      );
      tables.push({ ...meta, payload: String(payloadRow.payload || "[]") });
    }

    const sequences = await client.unsafe(
      "select sequencename, last_value from pg_sequences where schemaname='auth' order by sequencename",
    );
    await client.unsafe("commit");
    return { fingerprint, tables, sequences };
  } catch (error) {
    try { await client.unsafe("rollback"); } catch { /* noop */ }
    throw error;
  }
}

async function applyAuthSnapshot(target: any, snapshot: any) {
  await target.begin(async (tx: any) => {
    await tx.unsafe("set local session_replication_role = replica");
    for (const table of snapshot.tables) await tx.unsafe(`delete from auth.${qident(table.name)}`);
    for (const table of snapshot.tables) {
      const columns = table.columns.map(qident).join(",");
      if (!columns || table.payload === "[]") continue;
      await tx.unsafe(
        `insert into auth.${qident(table.name)} (${columns}) select ${columns} from jsonb_populate_recordset(null::auth.${qident(table.name)}, $1::jsonb)`,
        [table.payload],
      );
    }
    for (const sequence of snapshot.sequences) {
      if (sequence.last_value === null || sequence.last_value === undefined) continue;
      await tx.unsafe(
        "select setval($1::regclass, $2::bigint, true)",
        [`auth.${String(sequence.sequencename)}`, String(sequence.last_value)],
      );
    }
  });
}

async function syncAuth(source: any, target: any) {
  await verifyAuthSchema(source, target);
  const [sourceCurrent, targetCurrent] = await Promise.all([authFingerprint(source), authFingerprint(target)]);
  if (sameRow(sourceCurrent, targetCurrent)) return { changed: false, source: sourceCurrent, target: targetCurrent };

  const sourceSnapshot = await captureAuthSnapshot(source);
  const targetRollback = await captureAuthSnapshot(target);
  await applyAuthSnapshot(target, sourceSnapshot);
  const targetAfter = await authFingerprint(target);
  if (!sameRow(sourceSnapshot.fingerprint, targetAfter)) {
    await applyAuthSnapshot(target, targetRollback);
    const restored = await authFingerprint(target);
    if (!sameRow(targetRollback.fingerprint, restored)) throw new Error("auth_sync_mismatch_and_rollback_verification_failed");
    throw new Error("auth_sync_mismatch_target_rolled_back");
  }
  return { changed: true, source: sourceSnapshot.fingerprint, target: targetAfter };
}

async function readStorageState(client: any) {
  const [bucket, manifest, summary] = await Promise.all([
    one(client, STORAGE_BUCKET_SQL),
    client.unsafe(STORAGE_MANIFEST_SQL),
    one(client, STORAGE_SUMMARY_SQL),
  ]);
  return { bucket, manifest, summary };
}

function buildStoragePlan(sourceRows: any[], targetRows: any[]) {
  const source = new Map(sourceRows.map((row) => [objectKey(row), row]));
  const target = new Map(targetRows.map((row) => [objectKey(row), row]));
  const copy: any[] = [];
  const targetOnly: any[] = [];
  for (const [key, row] of source) {
    const other = target.get(key);
    if (!other || Number(row.size || 0) !== Number(other.size || 0) || normalizeEtag(row.etag) !== normalizeEtag(other.etag)) copy.push(row);
  }
  for (const [key, row] of target) if (!source.has(key)) targetOnly.push(row);
  return { source, target, copy, targetOnly };
}

async function scanTombstones(ddb: any, tableName: string) {
  const items: any[] = [];
  let startKey: any = undefined;
  do {
    const result = await ddb.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: startKey,
      ProjectionExpression: "object_key, bucket_id, object_name, first_seen",
    }));
    items.push(...(result.Items || []));
    startKey = result.LastEvaluatedKey;
  } while (startKey);
  return items;
}

async function reconcileStorage(sourceDb: any, targetDb: any, body: any) {
  const sourceUrl = required("DR_VIRGINIA_URL");
  const targetUrl = required("DR_OREGON_URL");
  const sourceKey = required("DR_VIRGINIA_SERVICE_ROLE_KEY");
  const targetKey = required("DR_OREGON_SERVICE_ROLE_KEY");
  const tombstoneTable = required("DR_STORAGE_TOMBSTONE_TABLE");
  const batchSize = Math.min(Math.max(Number(body?.batchSize || 10), 1), 25);
  const deleteBatchSize = Math.min(Math.max(Number(body?.deleteBatchSize || 5), 0), 10);
  const graceSeconds = Math.max(Number(Deno.env.get("DR_STORAGE_DELETE_GRACE_SECONDS") || 86400), 3600);

  const [sourceState, targetState] = await Promise.all([readStorageState(sourceDb), readStorageState(targetDb)]);
  if (!sameRow(sourceState.bucket, targetState.bucket)) throw new Error("storage_bucket_config_mismatch");

  const plan = buildStoragePlan(sourceState.manifest, targetState.manifest);
  const sourceStorage = createClient(sourceUrl, sourceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const targetStorage = createClient(targetUrl, targetKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let copied = 0;
  for (const item of plan.copy.slice(0, batchSize)) {
    const { data, error } = await sourceStorage.storage.from(String(item.bucket_id)).download(String(item.name));
    if (error || !data) throw new Error(`storage_source_download_failed:${error?.message || "missing_blob"}`);
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.byteLength !== Number(item.size || 0)) throw new Error("storage_source_size_mismatch");
    const { error: uploadError } = await targetStorage.storage.from(String(item.bucket_id)).upload(String(item.name), bytes, {
      upsert: true,
      contentType: String(item.mimetype || "application/octet-stream"),
      cacheControl: String(item.cache_control || "3600"),
    });
    if (uploadError) throw new Error(`storage_target_upload_failed:${uploadError.message}`);
    copied += 1;
  }

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const now = Math.floor(Date.now() / 1000);
  const tombstones = await scanTombstones(ddb, tombstoneTable);
  for (const tombstone of tombstones) {
    if (plan.source.has(String(tombstone.object_key))) {
      await ddb.send(new DeleteCommand({ TableName: tombstoneTable, Key: { object_key: tombstone.object_key } }));
    }
  }

  let deleted = 0;
  let tombstoned = 0;
  let deleteGuarded = false;
  const maxSafeTargetOnly = Math.max(100, Math.ceil(sourceState.manifest.length * 0.05));
  if (plan.targetOnly.length > maxSafeTargetOnly || sourceState.manifest.length === 0) {
    deleteGuarded = plan.targetOnly.length > 0;
  } else {
    for (const item of plan.targetOnly) {
      const key = objectKey(item);
      const existing = await ddb.send(new GetCommand({ TableName: tombstoneTable, Key: { object_key: key } }));
      const firstSeen = Number(existing.Item?.first_seen || 0);
      if (!firstSeen) {
        await ddb.send(new PutCommand({
          TableName: tombstoneTable,
          Item: {
            object_key: key,
            bucket_id: String(item.bucket_id),
            object_name: String(item.name),
            first_seen: now,
            expires_at: now + graceSeconds + 604800,
          },
        }));
        tombstoned += 1;
        continue;
      }
      if (deleted >= deleteBatchSize || now - firstSeen < graceSeconds) continue;
      const { error } = await targetStorage.storage.from(String(item.bucket_id)).remove([String(item.name)]);
      if (error) throw new Error(`storage_target_delete_failed:${error.message}`);
      await ddb.send(new DeleteCommand({ TableName: tombstoneTable, Key: { object_key: key } }));
      deleted += 1;
    }
  }

  const targetAfter = await readStorageState(targetDb);
  const afterPlan = buildStoragePlan(sourceState.manifest, targetAfter.manifest);
  return {
    copied,
    deleted,
    tombstoned,
    deleteGuarded,
    copyRemaining: afterPlan.copy.length,
    targetOnlyRemaining: afterPlan.targetOnly.length,
    sourceObjects: sourceState.manifest.length,
    targetObjects: targetAfter.manifest.length,
    sourceBytes: String(sourceState.summary.bytes),
    targetBytes: String(targetAfter.summary.bytes),
    manifestParity: sameRow(sourceState.summary, targetAfter.summary),
  };
}

async function health(source: any, target: any) {
  const sourceReplication = await one(source, `
    select (select count(*) from pg_publication where pubname='${PUBLICATION}') as publication_count,
           (select count(*) from pg_publication_tables where pubname='${PUBLICATION}') as publication_tables,
           (select count(*) from pg_replication_slots where slot_name='${SLOT}') as slot_count,
           (select count(*) from pg_replication_slots where slot_name='${SLOT}' and active) as active_slots,
           (select coalesce(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn),0)::bigint from pg_replication_slots where slot_name='${SLOT}') as lag_bytes`);
  const targetReplication = await one(target, `
    select (select count(*) from pg_subscription where subname='${SUBSCRIPTION}' and subenabled) as subscription_count,
           (select count(*) from pg_subscription s join pg_stat_subscription st on st.subid=s.oid where s.subname='${SUBSCRIPTION}' and st.pid is not null) as connected_workers,
           (select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${SUBSCRIPTION}') as subscribed_tables,
           (select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname='${SUBSCRIPTION}' and sr.srsubstate <> 'r') as pending_tables,
           (select count(*) from cron.job where active) as active_cron_jobs`);

  const [sourceAuth, targetAuth, sourceStorage, targetStorage] = await Promise.all([
    authFingerprint(source),
    authFingerprint(target),
    one(source, STORAGE_SUMMARY_SQL),
    one(target, STORAGE_SUMMARY_SQL),
  ]);

  const criticalHealthy =
    Number(sourceReplication.publication_count) === 1 &&
    Number(sourceReplication.slot_count) === 1 &&
    Number(sourceReplication.active_slots) === 1 &&
    Number(targetReplication.subscription_count) === 1 &&
    Number(targetReplication.connected_workers) >= 1 &&
    Number(targetReplication.pending_tables) === 0 &&
    Number(sourceReplication.publication_tables) === Number(targetReplication.subscribed_tables) &&
    Number(targetReplication.active_cron_jobs) === 0;

  return {
    criticalHealthy,
    authParity: sameRow(sourceAuth, targetAuth),
    storageParity: sameRow(sourceStorage, targetStorage),
    lagBytes: Number(sourceReplication.lag_bytes || 0),
    publicationTables: Number(sourceReplication.publication_tables || 0),
    subscribedTables: Number(targetReplication.subscribed_tables || 0),
    pendingTables: Number(targetReplication.pending_tables || 0),
    workerConnected: Number(targetReplication.connected_workers || 0) >= 1,
    oregonActiveCronJobs: Number(targetReplication.active_cron_jobs || 0),
  };
}

function json(body: unknown, status = 200) {
  return new Response(stable(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const operation = String(body?.operation || "health");
  const source = sqlClient(required("DR_VIRGINIA_DB_URL"));
  const target = sqlClient(required("DR_OREGON_DB_URL"));

  try {
    if (operation === "health") {
      const result = await health(source, target);
      const strict = body?.strict === true;
      const healthy = result.criticalHealthy && result.authParity && result.storageParity;
      return json(
        { success: strict ? healthy : result.criticalHealthy, healthy, operation, ...result },
        strict && !healthy ? 503 : result.criticalHealthy ? 200 : 503,
      );
    }
    if (operation === "auth_sync") {
      const result = await syncAuth(source, target);
      return json({ success: true, operation, ...result });
    }
    if (operation === "storage_sync") {
      const result = await reconcileStorage(source, target, body);
      return json({ success: true, operation, ...result });
    }
    return json({ success: false, error: "unsupported_operation", operation }, 400);
  } catch (error) {
    console.error("oregon dr maintenance failure", { operation, error });
    return json({ success: false, operation, error: error instanceof Error ? error.message : String(error) }, 500);
  } finally {
    await Promise.allSettled([source.end({ timeout: 1 }), target.end({ timeout: 1 })]);
  }
});
