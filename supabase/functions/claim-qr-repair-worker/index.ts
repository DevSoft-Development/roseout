import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import QRCode from "npm:qrcode@1.5.4";

type RepairTable = "restaurants" | "activities" | "locations";
type Row = Record<string, any>;

type Checkpoint = {
  tableIndex: number;
  table: RepairTable;
  offset: number;
  totals: Record<RepairTable, number>;
  total: number;
  scanned: number;
  updated: number;
  repairedLegacyUrls: number;
  regeneratedQrs: number;
  locationsSynced: number;
  errors: number;
};

const TABLES: RepairTable[] = ["restaurants", "activities", "locations"];
const CLAIM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CANONICAL_SITE_URL = "https://theouthaven.com";
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 50;
const WORK_BUDGET_MS = 42_000;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const workerSecret = Deno.env.get("WORKER_INTERNAL_SECRET") ?? "";
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  if (!secureCompare(req.headers.get("x-worker-secret") ?? "", workerSecret)) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const requestedJobId = String(body.job_id || "").trim();
  const workerId = `claim-qr-repair-${crypto.randomUUID()}`;

  try {
    const job = requestedJobId
      ? await claimSpecificJob(requestedJobId, workerId)
      : await claimNextJob(workerId);

    if (!job) return json({ success: true, claimed: 0, message: "No claim QR repair job is ready." });

    const result = await processJob(job);
    return json({ success: true, claimed: 1, job_id: job.id, ...result });
  } catch (error) {
    return json({ success: false, error: message(error) }, 500);
  }
});

async function claimNextJob(workerId: string) {
  const { data, error } = await db.rpc("claim_worker_jobs", {
    p_worker: workerId,
    p_limit: 1,
    p_job_types: ["claim.qr_repair"],
    p_lease_seconds: 120,
  });
  if (error) throw new Error(`Unable to claim repair job: ${error.message}`);
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function claimSpecificJob(jobId: string, workerId: string) {
  const { data: existing, error: readError } = await db
    .from("worker_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("job_type", "claim.qr_repair")
    .maybeSingle();
  if (readError) throw new Error(`Unable to read repair job: ${readError.message}`);
  if (!existing || !["queued", "running"].includes(existing.status)) return null;

  if (existing.status === "running") return existing;

  const { data, error } = await db
    .from("worker_jobs")
    .update({
      status: "running",
      attempt_count: Number(existing.attempt_count || 0) + 1,
      started_at: existing.started_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      lease_owner: workerId,
      lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
      heartbeat_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Unable to claim repair job: ${error.message}`);
  return data;
}

async function processJob(job: Row) {
  const started = Date.now();
  const batchSize = Math.min(
    Math.max(Number(job.payload?.batch_size || DEFAULT_BATCH_SIZE), 1),
    MAX_BATCH_SIZE,
  );

  let checkpoint = await loadCheckpoint(job);

  try {
    while (checkpoint.tableIndex < TABLES.length && Date.now() - started < WORK_BUDGET_MS) {
      const table = TABLES[checkpoint.tableIndex];
      checkpoint.table = table;
      const total = checkpoint.totals[table];

      if (checkpoint.offset >= total) {
        checkpoint.tableIndex += 1;
        checkpoint.offset = 0;
        if (checkpoint.tableIndex < TABLES.length) checkpoint.table = TABLES[checkpoint.tableIndex];
        await persistProgress(job.id, checkpoint);
        continue;
      }

      const from = checkpoint.offset;
      const to = Math.min(from + batchSize - 1, Math.max(total - 1, from));
      const { data, error } = await db
        .from(table)
        .select("id,source_table,source_id,claim_status,claim_code,claim_token,claim_url,claim_qr_url,qr_link,qr_code_data_url")
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`${table}: ${error.message}`);

      const rows = data || [];
      for (const row of rows) {
        try {
          const repair = await repairRow(table, row);
          if (repair.updated) checkpoint.updated += 1;
          if (repair.repairedLegacyUrl) checkpoint.repairedLegacyUrls += 1;
          if (repair.regeneratedQr) checkpoint.regeneratedQrs += 1;
          checkpoint.locationsSynced += repair.locationsSynced;
        } catch (error) {
          checkpoint.errors += 1;
          console.error("claim qr record repair failed", {
            table,
            id: row.id,
            error: message(error),
          });
        }
      }

      checkpoint.offset += rows.length;
      checkpoint.scanned += rows.length;
      await persistProgress(job.id, checkpoint);

      if (rows.length === 0) {
        checkpoint.offset = total;
      }
    }

    if (checkpoint.tableIndex >= TABLES.length) {
      await db.rpc("complete_worker_job", {
        p_job_id: job.id,
        p_result: checkpoint,
      });
      return { completed: true, checkpoint };
    }

    await requeueForContinuation(job.id, checkpoint);
    return { completed: false, checkpoint, message: "Checkpoint saved; next Edge pass will continue automatically." };
  } catch (error) {
    await db.rpc("fail_worker_job", {
      p_job_id: job.id,
      p_error: message(error),
      p_retryable: true,
      p_backoff_seconds: 15,
      p_metadata: { checkpoint },
    });
    throw error;
  }
}

async function loadCheckpoint(job: Row): Promise<Checkpoint> {
  const saved = job.checkpoint && typeof job.checkpoint === "object" ? job.checkpoint : {};
  const savedTotals = saved.totals && typeof saved.totals === "object" ? saved.totals : null;

  let totals: Record<RepairTable, number>;
  if (savedTotals) {
    totals = {
      restaurants: Number(savedTotals.restaurants || 0),
      activities: Number(savedTotals.activities || 0),
      locations: Number(savedTotals.locations || 0),
    };
  } else {
    totals = {
      restaurants: await countRows("restaurants"),
      activities: await countRows("activities"),
      locations: await countRows("locations"),
    };
  }

  const tableIndex = Math.min(Math.max(Number(saved.tableIndex || 0), 0), TABLES.length);
  const total = totals.restaurants + totals.activities + totals.locations;

  return {
    tableIndex,
    table: TABLES[Math.min(tableIndex, TABLES.length - 1)] || "locations",
    offset: Math.max(Number(saved.offset || 0), 0),
    totals,
    total,
    scanned: Math.max(Number(saved.scanned || 0), 0),
    updated: Math.max(Number(saved.updated || 0), 0),
    repairedLegacyUrls: Math.max(Number(saved.repairedLegacyUrls || 0), 0),
    regeneratedQrs: Math.max(Number(saved.regeneratedQrs || 0), 0),
    locationsSynced: Math.max(Number(saved.locationsSynced || 0), 0),
    errors: Math.max(Number(saved.errors || 0), 0),
  };
}

async function countRows(table: RepairTable) {
  const { count, error } = await db.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count || 0;
}

async function repairRow(table: RepairTable, row: Row) {
  const legacy = isLegacy(row.claim_url) || isLegacy(row.qr_link);
  const needsRepair =
    missing(row.claim_code) ||
    missing(row.claim_token) ||
    missing(row.claim_url) ||
    missing(row.claim_qr_url) ||
    missing(row.qr_link) ||
    missing(row.qr_code_data_url) ||
    missing(row.claim_status) ||
    legacy;

  if (!needsRepair) {
    return { updated: false, repairedLegacyUrl: false, regeneratedQr: false, locationsSynced: 0 };
  }

  const existingCode = normalizeClaimCode(row.claim_code);
  const claimCode = existingCode || await generateUniqueClaimCode(table, row.id);
  const claimToken = missing(row.claim_token) ? crypto.randomUUID() : String(row.claim_token);
  const canonicalClaimUrl = `${CANONICAL_SITE_URL}/business/claim?code=${encodeURIComponent(claimCode)}`;
  const shouldRepairUrl = missing(row.claim_url) || legacy || missing(existingCode) || missing(row.claim_token);
  const claimUrl = shouldRepairUrl ? canonicalClaimUrl : String(row.claim_url);
  const shouldRegenerateQr =
    shouldRepairUrl ||
    isLegacy(row.qr_link) ||
    missing(row.qr_code_data_url) ||
    missing(row.claim_qr_url);
  const qrDataUrl = shouldRegenerateQr
    ? await QRCode.toDataURL(claimUrl, { margin: 2, width: 700 })
    : String(row.qr_code_data_url || row.claim_qr_url);

  const fields = {
    claim_code: claimCode,
    claim_token: claimToken,
    claim_url: claimUrl,
    claim_status: row.claim_status || "unclaimed",
    qr_link: shouldRepairUrl || isLegacy(row.qr_link) || missing(row.qr_link) ? claimUrl : String(row.qr_link),
    claim_qr_url: shouldRegenerateQr || missing(row.claim_qr_url) ? qrDataUrl : String(row.claim_qr_url),
    qr_code_data_url: qrDataUrl,
  };

  const { error } = await db.from(table).update(fields).eq("id", row.id);
  if (error) throw new Error(`${table}:${row.id}: ${error.message}`);

  let locationsSynced = 0;
  if (table === "restaurants" || table === "activities") {
    const { data: synced, error: syncError } = await db
      .from("locations")
      .update(fields)
      .eq("source_table", table)
      .eq("source_id", String(row.id))
      .select("id");
    if (syncError) throw new Error(`locations sync ${table}:${row.id}: ${syncError.message}`);
    locationsSynced = synced?.length || 0;
  }

  if (table === "locations") {
    await db.from("location_claim_codes").upsert(
      {
        location_id: String(row.id),
        claim_code: claimCode,
        claim_url: claimUrl,
        qr_url: fields.claim_qr_url,
        status: fields.claim_status === "claimed" ? "claimed" : "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "location_id" },
    );
  }

  return {
    updated: true,
    repairedLegacyUrl: legacy,
    regeneratedQr: shouldRegenerateQr,
    locationsSynced,
  };
}

async function generateUniqueClaimCode(table: RepairTable, id: string | number) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const raw = Array.from(bytes, (byte) => CLAIM_CODE_ALPHABET[byte % CLAIM_CODE_ALPHABET.length]).join("");
    const code = `TOH-${raw.slice(0, 4)}-${raw.slice(4)}`;
    if (await isClaimCodeAvailable(code, table, id)) return code;
  }
  throw new Error("Could not generate a unique claim code.");
}

async function isClaimCodeAvailable(code: string, currentTable: RepairTable, currentId: string | number) {
  for (const table of ["locations", "restaurants", "activities"] as RepairTable[]) {
    let query = db.from(table).select("id").eq("claim_code", code).limit(1);
    if (table === currentTable) query = query.neq("id", currentId);
    const { data, error } = await query;
    if (error) throw new Error(`${table} claim code lookup: ${error.message}`);
    if (data?.length) return false;
  }
  return true;
}

async function persistProgress(jobId: string, checkpoint: Checkpoint) {
  const { error } = await db.rpc("update_worker_job_progress", {
    p_job_id: jobId,
    p_progress_current: checkpoint.scanned,
    p_progress_total: checkpoint.total,
    p_checkpoint: checkpoint,
    p_result: checkpoint,
  });
  if (error) throw new Error(`Unable to save repair progress: ${error.message}`);
}

async function requeueForContinuation(jobId: string, checkpoint: Checkpoint) {
  const { error } = await db
    .from("worker_jobs")
    .update({
      status: "queued",
      run_after: new Date(Date.now() + 1000).toISOString(),
      checkpoint,
      result: checkpoint,
      progress_current: checkpoint.scanned,
      progress_total: checkpoint.total,
      updated_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
      heartbeat_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", jobId);
  if (error) throw new Error(`Unable to queue the next repair pass: ${error.message}`);
}

function normalizeClaimCode(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function missing(value: unknown) {
  return !String(value ?? "").trim();
}

function isLegacy(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  return Boolean(
    raw && (
      raw.includes("roseout.com") ||
      raw.includes("roseout.vercel.app") ||
      raw.includes("theouthaven.vercel.app") ||
      raw.includes("/location/apply/claim") ||
      raw.includes("/claim/")
    )
  );
}

function secureCompare(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
