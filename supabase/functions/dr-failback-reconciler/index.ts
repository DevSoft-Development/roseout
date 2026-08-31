// @ts-nocheck
import SparkMD5 from "https://esm.sh/spark-md5@3.0.2";

const MANAGEMENT_TOKEN = Deno.env.get("DR_SUPABASE_ACCESS_TOKEN") || "";
const VIRGINIA_REF = Deno.env.get("DR_VIRGINIA_REF") || "";
const VIRGINIA_URL = (Deno.env.get("DR_VIRGINIA_URL") || "").replace(/\/$/, "");
const VIRGINIA_SERVICE_ROLE = Deno.env.get("DR_VIRGINIA_SERVICE_ROLE_KEY") || "";
const OREGON_REF = Deno.env.get("DR_OREGON_REF") || "";
const OREGON_URL = (Deno.env.get("DR_OREGON_URL") || "").replace(/\/$/, "");
const OREGON_SERVICE_ROLE = Deno.env.get("DR_OREGON_SERVICE_ROLE_KEY") || "";
const DEFAULT_MAX_STORAGE_COPIES = Number(Deno.env.get("DR_STORAGE_MAX_COPIES_PER_RUN") || "50");

const FORWARD_SUBSCRIPTION = "theouthaven_va_to_or_dr";
const FORWARD_SLOT = "theouthaven_va_to_or_dr_slot";
const FAILBACK_PUBLICATION = "theouthaven_failback_publication";
const FAILBACK_SUBSCRIPTION = "theouthaven_or_to_va_failback";
const FAILBACK_SLOT = "theouthaven_or_to_va_failback_slot";
const CONFIRMATION = "FAILBACK_RECONCILE";

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
  };
  for (const [key, value] of Object.entries(required)) {
    if (!value) throw new Error(`missing_dr_config_${key.toLowerCase()}`);
  }
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

async function inspectFailbackTopology() {
  const candidateSql = `with candidate as (
    select n.nspname||'.'||c.relname as rel
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and n.nspname='public'
      and c.relname not in ('toh_region_migration_apply_errors','toh_storage_migration_manifest')
  ) select count(*)::int as candidate_tables,
    md5(coalesce(string_agg(rel,',' order by rel),'')) as candidate_fp from candidate;`;

  const oregonSql = `with published as (
    select schemaname||'.'||tablename as rel from pg_publication_tables where pubname=${literal(FAILBACK_PUBLICATION)}
  ) select
    (select count(*) from cron.job where active)::int as active_cron_jobs,
    (select count(*) from pg_subscription where subname=${literal(FORWARD_SUBSCRIPTION)} and subenabled)::int as enabled_forward_subscriptions,
    (select count(*) from pg_stat_subscription where subname=${literal(FORWARD_SUBSCRIPTION)} and pid is not null)::int as forward_workers,
    (select count(*) from pg_publication where pubname=${literal(FAILBACK_PUBLICATION)})::int as failback_publications,
    (select count(*) from published)::int as failback_published_tables,
    (select md5(coalesce(string_agg(rel,',' order by rel),'')) from published) as failback_published_fp,
    (select count(*) from pg_replication_slots where slot_name=${literal(FAILBACK_SLOT)})::int as failback_slots,
    (select count(*) from pg_replication_slots where slot_name=${literal(FAILBACK_SLOT)} and active)::int as active_failback_slots,
    coalesce((select pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)::bigint from pg_replication_slots where slot_name=${literal(FAILBACK_SLOT)}),-1) as failback_lag_bytes;`;

  const virginiaSql = `select
    (select count(*) from cron.job)::int as cron_jobs,
    (select count(*) from pg_replication_slots where slot_name=${literal(FORWARD_SLOT)} and active)::int as active_forward_slots,
    (select count(*) from pg_subscription where subname=${literal(FAILBACK_SUBSCRIPTION)})::int as failback_subscriptions,
    (select count(*) from pg_subscription where subname=${literal(FAILBACK_SUBSCRIPTION)} and subenabled)::int as enabled_failback_subscriptions,
    (select count(*) from pg_stat_subscription where subname=${literal(FAILBACK_SUBSCRIPTION)} and pid is not null)::int as failback_workers,
    (select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname=${literal(FAILBACK_SUBSCRIPTION)})::int as failback_subscribed_tables,
    (select count(*) from pg_subscription_rel sr join pg_subscription s on s.oid=sr.srsubid where s.subname=${literal(FAILBACK_SUBSCRIPTION)} and sr.srsubstate='r')::int as failback_ready_tables;`;

  const [oregonCandidateRows, virginiaCandidateRows, oregonRows, virginiaRows] = await Promise.all([
    managementQuery(OREGON_REF, candidateSql),
    managementQuery(VIRGINIA_REF, candidateSql),
    managementQuery(OREGON_REF, oregonSql),
    managementQuery(VIRGINIA_REF, virginiaSql),
  ]);

  const oregonCandidate = oregonCandidateRows[0] || {};
  const virginiaCandidate = virginiaCandidateRows[0] || {};
  const oregon = oregonRows[0] || {};
  const virginia = virginiaRows[0] || {};
  const candidateTables = Number(oregonCandidate.candidate_tables || 0);

  const blockers: string[] = [];
  if (Number(oregon.active_cron_jobs) !== 0) blockers.push("oregon_pg_cron_active");
  if (Number(virginia.cron_jobs) !== 0) blockers.push("virginia_pg_cron_not_empty");
  if (String(oregonCandidate.candidate_fp || "") !== String(virginiaCandidate.candidate_fp || "")) blockers.push("public_table_inventory_mismatch");
  if (Number(oregon.enabled_forward_subscriptions) !== 0) blockers.push("old_virginia_to_oregon_subscription_still_enabled");
  if (Number(oregon.forward_workers) !== 0) blockers.push("old_virginia_to_oregon_worker_still_connected");
  if (Number(virginia.active_forward_slots) !== 0) blockers.push("old_virginia_to_oregon_slot_still_active");
  if (Number(oregon.failback_publications) !== 1) blockers.push("oregon_failback_publication_missing_or_duplicate");
  if (Number(oregon.failback_slots) !== 1) blockers.push("oregon_failback_slot_missing_or_duplicate");
  if (Number(oregon.active_failback_slots) !== 1) blockers.push("oregon_failback_slot_not_active");
  if (Number(oregon.failback_lag_bytes) !== 0) blockers.push("oregon_to_virginia_wal_lag_not_zero");
  if (Number(oregon.failback_published_tables) !== candidateTables) blockers.push("oregon_failback_publication_table_count_mismatch");
  if (String(oregon.failback_published_fp || "") !== String(oregonCandidate.candidate_fp || "")) blockers.push("oregon_failback_publication_membership_mismatch");
  if (Number(virginia.failback_subscriptions) !== 1) blockers.push("virginia_failback_subscription_missing_or_duplicate");
  if (Number(virginia.enabled_failback_subscriptions) !== 1) blockers.push("virginia_failback_subscription_not_enabled");
  if (Number(virginia.failback_workers) !== 1) blockers.push("virginia_failback_worker_not_connected");
  if (Number(virginia.failback_subscribed_tables) !== candidateTables) blockers.push("virginia_failback_subscription_table_count_mismatch");
  if (Number(virginia.failback_ready_tables) !== candidateTables) blockers.push("virginia_failback_relations_not_ready");

  return {
    eligible: blockers.length === 0,
    blockers,
    candidateTables,
    reverseLagBytes: Number(oregon.failback_lag_bytes || -1),
    oregonActiveCronJobs: Number(oregon.active_cron_jobs || 0),
    virginiaCronJobs: Number(virginia.cron_jobs || 0),
    oldForwardSubscriptionEnabled: Number(oregon.enabled_forward_subscriptions || 0),
    oldForwardWorkers: Number(oregon.forward_workers || 0),
    oldForwardSlotActive: Number(virginia.active_forward_slots || 0),
    reversePublicationTables: Number(oregon.failback_published_tables || 0),
    reverseSubscriptionTables: Number(virginia.failback_subscribed_tables || 0),
    reverseReadyTables: Number(virginia.failback_ready_tables || 0),
    reverseWorkers: Number(virginia.failback_workers || 0),
  };
}

async function proveOregonWritesQuiesced() {
  const sql = `select coalesce(sum(n_tup_ins+n_tup_upd+n_tup_del),0)::bigint as public_tuple_changes
    from pg_stat_user_tables
    where schemaname='public' and relname not in ('toh_region_migration_apply_errors','toh_storage_migration_manifest');`;
  const before = await managementQuery(OREGON_REF, sql);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const after = await managementQuery(OREGON_REF, sql);
  const beforeCount = String(before[0]?.public_tuple_changes || "0");
  const afterCount = String(after[0]?.public_tuple_changes || "0");
  if (beforeCount !== afterCount) throw new Error("oregon_public_writes_observed_during_quiesce_window");
  return { before: beforeCount, after: afterCount, seconds: 5 };
}

function requireMutationAuthorization(body: any, guard: any) {
  if (body?.oregonPrimaryConfirmed !== true) throw new Error("oregon_primary_not_confirmed");
  if (body?.oregonWritesQuiesced !== true) throw new Error("oregon_writes_quiesced_not_confirmed");
  if (String(body?.confirmation || "") !== CONFIRMATION) throw new Error("failback_reconcile_confirmation_missing");
  if (!guard?.eligible) throw new Error(`failback_topology_guard_failed:${(guard?.blockers || []).join(",")}`);
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
    managementQuery(OREGON_REF, AUTH_METADATA_SQL),
    managementQuery(VIRGINIA_REF, AUTH_METADATA_SQL),
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
  if (new TextEncoder().encode(serialized).byteLength > 8 * 1024 * 1024) throw new Error("auth_snapshot_exceeds_8mb_guard");
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
  for (const table of metadata) statements.push(`delete from auth.${qid(String(table.table_name))};`);
  for (const table of metadata) {
    const tableName = String(table.table_name);
    const row = byTable.get(tableName);
    const data = Array.isArray(row?.rows) ? row.rows : [];
    if (data.length === 0) continue;
    const columns = (table.columns || []).filter((c: any) => String(c.generated || "") === "").map((c: any) => String(c.name));
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
    captureAuthSnapshot(OREGON_REF, metadata),
    captureAuthSnapshot(VIRGINIA_REF, metadata),
  ]);
  const sourceRows = source.rows.reduce((sum: number, row: any) => sum + Number(row.row_count || 0), 0);
  const targetRows = target.rows.reduce((sum: number, row: any) => sum + Number(row.row_count || 0), 0);
  if (authSnapshotsEqual(source, target)) {
    return { success: true, operation: "auth", direction: "oregon_to_virginia", parity: true, changed: false, sourceRows, targetRows, dryRun };
  }
  if (dryRun) {
    return { success: true, operation: "auth", direction: "oregon_to_virginia", parity: false, changed: false, sourceRows, targetRows, dryRun };
  }

  await managementQuery(VIRGINIA_REF, buildAuthReplaceSql(source, metadata), 60_000);
  const after = await currentAuthStats(VIRGINIA_REF, metadata);
  if (statsRows(after) !== authStats(source)) {
    await managementQuery(VIRGINIA_REF, buildAuthReplaceSql(target, metadata), 60_000);
    throw new Error("auth_post_sync_verification_failed_and_rolled_back");
  }
  const seqAfter = await managementQuery(VIRGINIA_REF, "select last_value::bigint::text as last_value, is_called from auth.refresh_tokens_id_seq;");
  const targetSequence = seqAfter[0] || {};
  if (String(targetSequence.last_value) !== String(source.sequence.last_value) || Boolean(targetSequence.is_called) !== Boolean(source.sequence.is_called)) {
    await managementQuery(VIRGINIA_REF, buildAuthReplaceSql(target, metadata), 60_000);
    throw new Error("auth_sequence_verification_failed_and_rolled_back");
  }
  return { success: true, operation: "auth", direction: "oregon_to_virginia", parity: true, changed: true, sourceRows, targetRows: sourceRows, dryRun: false };
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
    managementQuery(OREGON_REF, BUCKET_SQL),
    managementQuery(VIRGINIA_REF, BUCKET_SQL),
    managementQuery(OREGON_REF, MANIFEST_SQL, 60_000),
    managementQuery(VIRGINIA_REF, MANIFEST_SQL, 60_000),
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
  return { copies, targetOnly };
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
  const bytes = await downloadObject(OREGON_URL, OREGON_SERVICE_ROLE, row);
  if (bytes.byteLength !== expectedSize) throw new Error("storage_source_size_verification_failed");
  const etag = normalizeEtag(row.etag);
  if (/^[0-9a-f]{32}$/.test(etag) && md5(bytes) !== etag) throw new Error("storage_source_md5_verification_failed");

  const bucket = encodeURIComponent(String(row.bucket_id));
  const path = encodedPath(String(row.name));
  const upload = await fetch(`${VIRGINIA_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${VIRGINIA_SERVICE_ROLE}`,
      apikey: VIRGINIA_SERVICE_ROLE,
      "x-upsert": "true",
      "content-type": String(row.mimetype || "application/octet-stream"),
      "cache-control": String(row.cache_control || "3600"),
    },
    body: bytes,
    signal: AbortSignal.timeout(60_000),
  });
  if (!upload.ok) throw new Error(`storage_upload_failed_${upload.status}`);
  const verify = await downloadObject(VIRGINIA_URL, VIRGINIA_SERVICE_ROLE, row);
  if (verify.byteLength !== expectedSize) throw new Error("storage_target_size_verification_failed");
  if (/^[0-9a-f]{32}$/.test(etag) && md5(verify) !== etag) throw new Error("storage_target_md5_verification_failed");
}

async function sourceObjectExists(bucket: string, name: string): Promise<boolean> {
  const rows = await managementQuery(OREGON_REF, `select exists(select 1 from storage.objects where bucket_id=${literal(bucket)} and name=${literal(name)}) as present;`);
  return Boolean(rows[0]?.present);
}

async function deleteVirginiaOnlyObject(row: any) {
  const bucket = String(row.bucket_id);
  const name = String(row.name);
  if (await sourceObjectExists(bucket, name)) throw new Error("storage_source_object_reappeared_before_delete");
  const res = await fetch(`${VIRGINIA_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(name)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${VIRGINIA_SERVICE_ROLE}`, apikey: VIRGINIA_SERVICE_ROLE },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok && res.status !== 404) throw new Error(`storage_delete_failed_${res.status}`);
  const verify = await managementQuery(VIRGINIA_REF, `select exists(select 1 from storage.objects where bucket_id=${literal(bucket)} and name=${literal(name)}) as present;`);
  if (Boolean(verify[0]?.present)) throw new Error("storage_delete_verification_failed");
}

async function reconcileStorage(dryRun: boolean, maxCopies: number, deleteTargetOnly: boolean) {
  const manifests = await storageManifests();
  const plan = storagePlan(manifests.source, manifests.target);
  const selected = plan.copies.slice(0, Math.max(0, maxCopies));
  let copied = 0;
  let deleted = 0;

  if (!dryRun) {
    for (let offset = 0; offset < selected.length; offset += 4) {
      const chunk = selected.slice(offset, offset + 4);
      await Promise.all(chunk.map(copyObject));
      copied += chunk.length;
    }
    if (deleteTargetOnly) {
      for (const row of plan.targetOnly) {
        await deleteVirginiaOnlyObject(row);
        deleted++;
      }
    }
  }

  return {
    success: true,
    operation: "storage",
    direction: "oregon_to_virginia",
    dryRun,
    sourceObjects: manifests.source.length,
    targetObjects: manifests.target.length,
    copyOrReplace: plan.copies.length,
    copied,
    deferredCopies: Math.max(0, plan.copies.length - selected.length),
    targetOnly: plan.targetOnly.length,
    pendingDeletes: dryRun || !deleteTargetOnly ? plan.targetOnly.length : Math.max(0, plan.targetOnly.length - deleted),
    deleted,
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
    const dryRun = body?.dryRun !== false;
    const guard = await inspectFailbackTopology();

    if (operation === "status") {
      const [auth, storage] = await Promise.all([
        reconcileAuth(true),
        reconcileStorage(true, 1, false),
      ]);
      return response({ success: true, operation: "status", direction: "oregon_to_virginia", guard, auth, storage });
    }

    if (operation !== "auth" && operation !== "storage") {
      return response({ success: false, error: "unsupported_operation", operation }, 400);
    }

    let quiesceEvidence: any = null;
    if (!dryRun) {
      requireMutationAuthorization(body, guard);
      quiesceEvidence = await proveOregonWritesQuiesced();
    }

    if (operation === "auth") {
      const result = await reconcileAuth(dryRun);
      return response({ ...result, guard, quiesceEvidence });
    }

    const requested = Number(body?.maxCopies || DEFAULT_MAX_STORAGE_COPIES);
    const maxCopies = Number.isFinite(requested) ? Math.min(100, Math.max(1, Math.floor(requested))) : DEFAULT_MAX_STORAGE_COPIES;
    const deleteTargetOnly = body?.deleteTargetOnly === true;
    const result = await reconcileStorage(dryRun, maxCopies, deleteTargetOnly);
    return response({ ...result, guard, quiesceEvidence });
  } catch (error) {
    console.error("dr failback reconciler failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return response({ success: false, error: error instanceof Error ? error.message : "dr_failback_reconciler_failed" }, 500);
  }
});
