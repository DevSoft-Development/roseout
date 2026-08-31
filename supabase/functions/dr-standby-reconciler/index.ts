// @ts-nocheck
import {
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
} from "npm:@aws-sdk/client-dynamodb@3.864.0";
import SparkMD5 from "https://esm.sh/spark-md5@3.0.2";

const MANAGEMENT_TOKEN = Deno.env.get("DR_SUPABASE_ACCESS_TOKEN") || "";
const VIRGINIA_REF = Deno.env.get("DR_VIRGINIA_REF") || "";
const VIRGINIA_URL = (Deno.env.get("DR_VIRGINIA_URL") || "").replace(/\/$/, "");
const VIRGINIA_SERVICE_ROLE = Deno.env.get("DR_VIRGINIA_SERVICE_ROLE_KEY") || "";
const OREGON_REF = Deno.env.get("DR_OREGON_REF") || "";
const OREGON_URL = (Deno.env.get("DR_OREGON_URL") || "").replace(/\/$/, "");
const OREGON_SERVICE_ROLE = Deno.env.get("DR_OREGON_SERVICE_ROLE_KEY") || "";
const DR_MODE = Deno.env.get("DR_MODE") || "";
const TOMBSTONE_TABLE = Deno.env.get("DR_STORAGE_TOMBSTONE_TABLE") || "";
const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";
const DELETE_GRACE_SECONDS = Number(Deno.env.get("DR_STORAGE_DELETE_GRACE_SECONDS") || "1800");
const DEFAULT_MAX_STORAGE_COPIES = Number(Deno.env.get("DR_STORAGE_MAX_COPIES_PER_RUN") || "50");

const PUBLICATION = "theouthaven_dr_publication";
const SUBSCRIPTION = "theouthaven_va_to_or_dr";
const SLOT = "theouthaven_va_to_or_dr_slot";
const EXPECTED_PUBLIC_TABLES = 462;

const ddb = new DynamoDBClient({ region: AWS_REGION });

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function qid(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error("unsafe_identifier");
  return `"${value.replaceAll('"', '""')}"`;
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function normalizeEtag(value: unknown): string {
  return String(value || "").trim().replace(/^"|"$/g, "").toLowerCase();
}

function objectKey(bucket: string, name: string): string {
  return `${bucket}\n${name}`;
}

function encodedPath(name: string): string {
  return name.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function requireConfig() {
  const required = {
    MANAGEMENT_TOKEN,
    VIRGINIA_REF,
    VIRGINIA_URL,
    VIRGINIA_SERVICE_ROLE,
    OREGON_REF,
    OREGON_URL,
    OREGON_SERVICE_ROLE,
    TOMBSTONE_TABLE,
  };
  for (const [key, value] of Object.entries(required)) {
    if (!value) throw new Error(`missing_dr_config_${key.toLowerCase()}`);
  }
  if (DR_MODE !== "virginia_primary") throw new Error("dr_mode_is_not_virginia_primary");
}

async function managementQuery(ref: string, query: string, timeoutMs = 45_000): Promise<any[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${MANAGEMENT_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`management_query_failed_${ref}_${res.status}`);
  const payload = await res.json();
  if (!Array.isArray(payload)) throw new Error(`management_query_invalid_response_${ref}`);
  return payload;
}

async function requirePassiveStandby() {
  const sourceSql = `select
    (select count(*) from cron.job) as cron_jobs,
    (select count(*) from pg_publication where pubname=${literal(PUBLICATION)}) as publications,
    (select count(*) from pg_replication_slots where slot_name=${literal(SLOT)}) as slots,
    (select count(*) from pg_replication_slots where slot_name=${literal(SLOT)} and active) as active_slots,
    coalesce((select pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)::bigint from pg_replication_slots where slot_name=${literal(SLOT)}),0) as slot_lag_bytes;`;
  const targetSql = `select
    (select count(*) from cron.job where active) as active_cron_jobs,
    (select count(*) from pg_subscription where subname=${literal(SUBSCRIPTION)} and subenabled) as enabled_subscriptions,
    (select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname=${literal(SUBSCRIPTION)}) as total_tables,
    (select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname=${literal(SUBSCRIPTION)} and sr.srsubstate='r') as ready_tables,
    (select count(*) from pg_stat_subscription where subname=${literal(SUBSCRIPTION)} and pid is not null) as connected_workers;`;
  const [sourceRows, targetRows] = await Promise.all([
    managementQuery(VIRGINIA_REF, sourceSql),
    managementQuery(OREGON_REF, targetSql),
  ]);
  const source = sourceRows[0] || {};
  const target = targetRows[0] || {};
  const healthy = Number(source.cron_jobs) === 0 &&
    Number(source.publications) === 1 &&
    Number(source.slots) === 1 &&
    Number(source.active_slots) === 1 &&
    Number(target.active_cron_jobs) === 0 &&
    Number(target.enabled_subscriptions) === 1 &&
    Number(target.total_tables) === EXPECTED_PUBLIC_TABLES &&
    Number(target.ready_tables) === EXPECTED_PUBLIC_TABLES &&
    Number(target.connected_workers) >= 1;
  if (!healthy) throw new Error("passive_standby_guard_failed");
  return {
    sourceCronJobs: Number(source.cron_jobs),
    sourceActiveSlots: Number(source.active_slots),
    sourceSlotLagBytes: Number(source.slot_lag_bytes || 0),
    targetActiveCronJobs: Number(target.active_cron_jobs),
    targetReadyTables: Number(target.ready_tables),
    targetConnectedWorkers: Number(target.connected_workers),
  };
}

const AUTH_METADATA_SQL = `select c.relname as table_name,
  jsonb_agg(jsonb_build_object(
    'name',a.attname,
    'data_type',format_type(a.atttypid,a.atttypmod),
    'not_null',a.attnotnull,
    'identity',a.attidentity::text,
    'generated',a.attgenerated::text
  ) order by a.attnum) as columns
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
where c.relkind='r' and n.nspname='auth' and c.relname <> 'schema_migrations'
group by c.relname
order by c.relname;`;

async function authMetadata() {
  const [source, target] = await Promise.all([
    managementQuery(VIRGINIA_REF, AUTH_METADATA_SQL),
    managementQuery(OREGON_REF, AUTH_METADATA_SQL),
  ]);
  if (JSON.stringify(source) !== JSON.stringify(target)) throw new Error("auth_schema_parity_failed");
  if (source.length !== 22) throw new Error(`unexpected_auth_table_count_${source.length}`);
  return source;
}

function authSnapshotSql(metadata: any[], includeRows: boolean): string {
  return metadata.map((table) => {
    const tableName = String(table.table_name);
    const generated = (table.columns || []).filter((c: any) => String(c.generated || "") !== "").map((c: any) => String(c.name));
    const rowJson = generated.length
      ? `to_jsonb(t) - ARRAY[${generated.map(literal).join(",")}]::text[]`
      : "to_jsonb(t)";
    return `select ${literal(tableName)} as table_name,
      count(*)::bigint::text as row_count,
      coalesce(sum(hashtextextended(to_jsonb(t)::text,0)::numeric),0)::text as row_fingerprint${includeRows ? `,
      coalesce(jsonb_agg(${rowJson}), '[]'::jsonb) as rows` : ""}
      from auth.${qid(tableName)} t`;
  }).join("\nunion all\n") + "\norder by table_name;";
}

async function captureAuthSnapshot(ref: string, metadata: any[]) {
  const rows = await managementQuery(ref, authSnapshotSql(metadata, true), 60_000);
  const seqRows = await managementQuery(ref, "select last_value::bigint::text as last_value, is_called from auth.refresh_tokens_id_seq;");
  const sequence = seqRows[0] || { last_value: "1", is_called: false };
  const serialized = JSON.stringify(rows);
  if (new TextEncoder().encode(serialized).byteLength > 8 * 1024 * 1024) {
    throw new Error("auth_snapshot_exceeds_8mb_guard");
  }
  return { rows, sequence };
}

function authStats(snapshot: any): string {
  return JSON.stringify((snapshot.rows || []).map((row: any) => ({
    table_name: row.table_name,
    row_count: String(row.row_count),
    row_fingerprint: String(row.row_fingerprint),
  })).sort((a: any, b: any) => String(a.table_name).localeCompare(String(b.table_name))));
}

function authSnapshotsEqual(a: any, b: any): boolean {
  return authStats(a) === authStats(b) &&
    String(a.sequence?.last_value) === String(b.sequence?.last_value) &&
    Boolean(a.sequence?.is_called) === Boolean(b.sequence?.is_called);
}

function buildAuthReplaceSql(snapshot: any, metadata: any[]): string {
  const byTable = new Map((snapshot.rows || []).map((row: any) => [String(row.table_name), row]));
  const statements = ["begin;", "set local session_replication_role = replica;"];
  for (const table of metadata) {
    statements.push(`delete from auth.${qid(String(table.table_name))};`);
  }
  for (const table of metadata) {
    const tableName = String(table.table_name);
    const row = byTable.get(tableName);
    const data = Array.isArray(row?.rows) ? row.rows : [];
    if (data.length === 0) continue;
    const columns = (table.columns || [])
      .filter((c: any) => String(c.generated || "") === "")
      .map((c: any) => String(c.name));
    if (!columns.length) continue;
    const columnSql = columns.map(qid).join(",");
    statements.push(`insert into auth.${qid(tableName)} (${columnSql}) select ${columnSql} from jsonb_populate_recordset(null::auth.${qid(tableName)}, ${literal(JSON.stringify(data))}::jsonb);`);
  }
  const lastValue = String(snapshot.sequence?.last_value || "1");
  if (!/^\d+$/.test(lastValue)) throw new Error("invalid_auth_sequence_value");
  statements.push(`select setval('auth.refresh_tokens_id_seq', ${lastValue}, ${Boolean(snapshot.sequence?.is_called) ? "true" : "false"});`);
  statements.push("commit;");
  return statements.join("\n");
}

async function currentAuthStats(ref: string, metadata: any[]) {
  return await managementQuery(ref, authSnapshotSql(metadata, false), 45_000);
}

function statsRows(rows: any[]): string {
  return JSON.stringify(rows.map((row: any) => ({
    table_name: row.table_name,
    row_count: String(row.row_count),
    row_fingerprint: String(row.row_fingerprint),
  })).sort((a: any, b: any) => String(a.table_name).localeCompare(String(b.table_name))));
}

async function reconcileAuth(dryRun: boolean) {
  const metadata = await authMetadata();
  const [source, target] = await Promise.all([
    captureAuthSnapshot(VIRGINIA_REF, metadata),
    captureAuthSnapshot(OREGON_REF, metadata),
  ]);
  const sourceRows = source.rows.reduce((sum: number, row: any) => sum + Number(row.row_count || 0), 0);
  const targetRows = target.rows.reduce((sum: number, row: any) => sum + Number(row.row_count || 0), 0);
  if (authSnapshotsEqual(source, target)) {
    return { success: true, operation: "auth", parity: true, changed: false, sourceRows, targetRows, dryRun };
  }
  if (dryRun) {
    return { success: true, operation: "auth", parity: false, changed: false, sourceRows, targetRows, dryRun };
  }

  await managementQuery(OREGON_REF, buildAuthReplaceSql(source, metadata), 60_000);
  const after = await currentAuthStats(OREGON_REF, metadata);
  if (statsRows(after) !== authStats(source)) {
    await managementQuery(OREGON_REF, buildAuthReplaceSql(target, metadata), 60_000);
    throw new Error("auth_post_sync_verification_failed_and_rolled_back");
  }
  const seqAfter = await managementQuery(OREGON_REF, "select last_value::bigint::text as last_value, is_called from auth.refresh_tokens_id_seq;");
  const targetSequence = seqAfter[0] || {};
  if (String(targetSequence.last_value) !== String(source.sequence.last_value) || Boolean(targetSequence.is_called) !== Boolean(source.sequence.is_called)) {
    await managementQuery(OREGON_REF, buildAuthReplaceSql(target, metadata), 60_000);
    throw new Error("auth_sequence_verification_failed_and_rolled_back");
  }
  return { success: true, operation: "auth", parity: true, changed: true, sourceRows, targetRows: sourceRows, dryRun: false };
}

const BUCKET_SQL = `select count(*) as buckets,
  md5(coalesce(string_agg(id||':'||public::text||':'||coalesce(file_size_limit::text,'')||':'||coalesce(array_to_string(allowed_mime_types,','),''),'|' order by id),'')) as bucket_fingerprint
from storage.buckets;`;
const MANIFEST_SQL = `select bucket_id, name,
  coalesce(metadata->>'eTag','') as etag,
  coalesce((metadata->>'size')::bigint,0)::text as size,
  coalesce(metadata->>'mimetype','application/octet-stream') as mimetype,
  coalesce(metadata->>'cacheControl','3600') as cache_control
from storage.objects order by bucket_id,name;`;

async function storageManifests() {
  const [sourceBuckets, targetBuckets, source, target] = await Promise.all([
    managementQuery(VIRGINIA_REF, BUCKET_SQL),
    managementQuery(OREGON_REF, BUCKET_SQL),
    managementQuery(VIRGINIA_REF, MANIFEST_SQL, 60_000),
    managementQuery(OREGON_REF, MANIFEST_SQL, 60_000),
  ]);
  if (JSON.stringify(sourceBuckets) !== JSON.stringify(targetBuckets)) throw new Error("storage_bucket_config_parity_failed");
  return { source, target };
}

function storagePlan(source: any[], target: any[]) {
  const sourceMap = new Map<string, any>();
  const targetMap = new Map<string, any>();
  for (const row of source) sourceMap.set(objectKey(String(row.bucket_id), String(row.name)), row);
  for (const row of target) targetMap.set(objectKey(String(row.bucket_id), String(row.name)), row);
  const copies: any[] = [];
  const targetOnly: any[] = [];
  for (const [key, row] of sourceMap) {
    const other = targetMap.get(key);
    if (!other || Number(row.size || 0) !== Number(other.size || 0) || normalizeEtag(row.etag) !== normalizeEtag(other.etag)) copies.push(row);
  }
  for (const [key, row] of targetMap) if (!sourceMap.has(key)) targetOnly.push(row);
  return { sourceMap, targetMap, copies, targetOnly };
}

function md5(buffer: ArrayBuffer): string {
  return String(SparkMD5.ArrayBuffer.hash(buffer)).toLowerCase();
}

async function downloadObject(baseUrl: string, serviceRole: string, row: any): Promise<ArrayBuffer> {
  const bucket = encodeURIComponent(String(row.bucket_id));
  const path = encodedPath(String(row.name));
  const res = await fetch(`${baseUrl}/storage/v1/object/authenticated/${bucket}/${path}`, {
    headers: { authorization: `Bearer ${serviceRole}`, apikey: serviceRole },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`storage_download_failed_${res.status}`);
  return await res.arrayBuffer();
}

async function copyObject(row: any) {
  const expectedSize = Number(row.size || 0);
  if (expectedSize > 64 * 1024 * 1024) throw new Error("storage_object_exceeds_64mb_worker_guard");
  const bytes = await downloadObject(VIRGINIA_URL, VIRGINIA_SERVICE_ROLE, row);
  if (bytes.byteLength !== expectedSize) throw new Error("storage_source_size_verification_failed");
  const etag = normalizeEtag(row.etag);
  if (/^[0-9a-f]{32}$/.test(etag) && md5(bytes) !== etag) throw new Error("storage_source_md5_verification_failed");

  const bucket = encodeURIComponent(String(row.bucket_id));
  const path = encodedPath(String(row.name));
  const upload = await fetch(`${OREGON_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${OREGON_SERVICE_ROLE}`,
      apikey: OREGON_SERVICE_ROLE,
      "x-upsert": "true",
      "content-type": String(row.mimetype || "application/octet-stream"),
      "cache-control": String(row.cache_control || "3600"),
    },
    body: bytes,
    signal: AbortSignal.timeout(60_000),
  });
  if (!upload.ok) throw new Error(`storage_upload_failed_${upload.status}`);
  const verify = await downloadObject(OREGON_URL, OREGON_SERVICE_ROLE, row);
  if (verify.byteLength !== expectedSize) throw new Error("storage_target_size_verification_failed");
  if (/^[0-9a-f]{32}$/.test(etag) && md5(verify) !== etag) throw new Error("storage_target_md5_verification_failed");
}

async function scanTombstones(): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  let ExclusiveStartKey: any = undefined;
  do {
    const page = await ddb.send(new ScanCommand({ TableName: TOMBSTONE_TABLE, ExclusiveStartKey }));
    for (const item of page.Items || []) {
      const key = item.object_key?.S || "";
      if (!key) continue;
      result.set(key, {
        bucket: item.bucket_id?.S || "",
        name: item.name?.S || "",
        firstSeen: Number(item.first_seen_at?.N || 0),
        observations: Number(item.observations?.N || 0),
      });
    }
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return result;
}

async function deleteTombstone(key: string) {
  await ddb.send(new DeleteItemCommand({ TableName: TOMBSTONE_TABLE, Key: { object_key: { S: key } } }));
}

async function putTombstone(row: any, firstSeen: number, observations: number, now: number) {
  const bucket = String(row.bucket_id);
  const name = String(row.name);
  await ddb.send(new PutItemCommand({
    TableName: TOMBSTONE_TABLE,
    Item: {
      object_key: { S: objectKey(bucket, name) },
      bucket_id: { S: bucket },
      name: { S: name },
      first_seen_at: { N: String(firstSeen) },
      last_seen_at: { N: String(now) },
      observations: { N: String(observations) },
      expires_at: { N: String(now + 7 * 24 * 60 * 60) },
    },
  }));
}

async function sourceObjectExists(bucket: string, name: string): Promise<boolean> {
  const rows = await managementQuery(VIRGINIA_REF, `select exists(select 1 from storage.objects where bucket_id=${literal(bucket)} and name=${literal(name)}) as present;`);
  return Boolean(rows[0]?.present);
}

async function deleteTargetObject(row: any) {
  const bucket = String(row.bucket_id);
  const name = String(row.name);
  if (await sourceObjectExists(bucket, name)) return false;
  const res = await fetch(`${OREGON_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(name)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${OREGON_SERVICE_ROLE}`, apikey: OREGON_SERVICE_ROLE },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok && res.status !== 404) throw new Error(`storage_delete_failed_${res.status}`);
  const verify = await managementQuery(OREGON_REF, `select exists(select 1 from storage.objects where bucket_id=${literal(bucket)} and name=${literal(name)}) as present;`);
  if (Boolean(verify[0]?.present)) throw new Error("storage_delete_verification_failed");
  return true;
}

async function reconcileTombstones(targetOnly: any[], dryRun: boolean) {
  const now = Math.floor(Date.now() / 1000);
  const targetOnlyMap = new Map(targetOnly.map((row) => [objectKey(String(row.bucket_id), String(row.name)), row]));
  const existing = await scanTombstones();
  let cleared = 0;
  let pending = 0;
  let deleted = 0;

  for (const [key] of existing) {
    if (!targetOnlyMap.has(key) && !dryRun) {
      await deleteTombstone(key);
      cleared++;
    }
  }
  for (const [key, row] of targetOnlyMap) {
    const prior = existing.get(key);
    if (!prior) {
      pending++;
      if (!dryRun) await putTombstone(row, now, 1, now);
      continue;
    }
    const observations = prior.observations + 1;
    const age = now - prior.firstSeen;
    if (!dryRun && age >= DELETE_GRACE_SECONDS && observations >= 2) {
      if (await deleteTargetObject(row)) deleted++;
      await deleteTombstone(key);
    } else {
      pending++;
      if (!dryRun) await putTombstone(row, prior.firstSeen, observations, now);
    }
  }
  return { cleared, pending, deleted };
}

async function reconcileStorage(dryRun: boolean, maxCopies: number) {
  const manifests = await storageManifests();
  const plan = storagePlan(manifests.source, manifests.target);
  const selected = plan.copies.slice(0, Math.max(0, maxCopies));
  let copied = 0;
  if (!dryRun) {
    for (let offset = 0; offset < selected.length; offset += 4) {
      const chunk = selected.slice(offset, offset + 4);
      await Promise.all(chunk.map(copyObject));
      copied += chunk.length;
    }
  }
  const tombstones = await reconcileTombstones(plan.targetOnly, dryRun);
  return {
    success: true,
    operation: "storage",
    dryRun,
    sourceObjects: manifests.source.length,
    targetObjects: manifests.target.length,
    copyOrReplace: plan.copies.length,
    copied,
    deferredCopies: Math.max(0, plan.copies.length - selected.length),
    targetOnly: plan.targetOnly.length,
    pendingDeletes: tombstones.pending,
    deleted: tombstones.deleted,
    clearedTombstones: tombstones.cleared,
    parity: plan.copies.length === 0 && plan.targetOnly.length === 0,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ success: false, error: "method_not_allowed" }, 405);
  if (req.headers.get("x-toh-aws-internal") !== "eventbridge") {
    return response({ success: false, error: "internal_eventbridge_only" }, 403);
  }
  try {
    requireConfig();
    const body = await req.json().catch(() => ({}));
    const operation = String(body?.operation || "status");
    const dryRun = Boolean(body?.dryRun);
    const guard = await requirePassiveStandby();

    if (operation === "auth") {
      const result = await reconcileAuth(dryRun);
      return response({ ...result, guard });
    }
    if (operation === "storage") {
      const requested = Number(body?.maxCopies || DEFAULT_MAX_STORAGE_COPIES);
      const maxCopies = Number.isFinite(requested) ? Math.min(100, Math.max(1, Math.floor(requested))) : DEFAULT_MAX_STORAGE_COPIES;
      const result = await reconcileStorage(dryRun, maxCopies);
      return response({ ...result, guard });
    }
    if (operation === "status") {
      const [auth, storage] = await Promise.all([
        reconcileAuth(true),
        reconcileStorage(true, 1),
      ]);
      return response({ success: true, operation: "status", guard, auth, storage });
    }
    return response({ success: false, error: "unsupported_operation", operation }, 400);
  } catch (error) {
    console.error("dr standby reconciler failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return response({ success: false, error: error instanceof Error ? error.message : "dr_reconciler_failed" }, 500);
  }
});
