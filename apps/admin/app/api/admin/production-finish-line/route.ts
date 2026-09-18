import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { accessSeeds, betaSeeds, commandSeeds, dailyTaskSeeds, decisionSeed, gateSeeds, qrSeeds, reserveSeeds, searchPromptSeeds, securitySeeds } from "@/lib/production-finish-line/seeds";

export const dynamic = "force-dynamic";
const allowed = ADMIN_PAGE_ACCESS.productionFinishLine;

type SeedRow = Record<string, any>;

const ITEM_FIELDS = "id,item_type,week,day,title,description,priority,status,owner,notes,test_url,codex_task_url,github_pr_url,last_checked,expected_behavior,actual_behavior,sort_order,created_at,updated_at";
const ACCESS_FIELDS = "id,role_name,area_name,status,notes,expected_behavior,actual_behavior,last_checked,sort_order,created_at,updated_at";
const QR_FIELDS = "id,pilot_number,location_id,location_name,address,claim_code,claim_url,qr_verified,postcard_printed,mailed,scanned,claim_started,claim_submitted,claim_approved,owner_dashboard_works,status,notes,last_checked,created_at,updated_at";
const COMMAND_FIELDS = "id,command,status,result,runner,notes,last_run_date,sort_order,created_at,updated_at";
const PROMPT_FIELDS = "id,prompt,status,expected_result,actual_result,issue_type,reviewed_at,notes,sort_order,created_at,updated_at";

function itemKey(row: SeedRow) {
  if (row.item_type === "daily_task") return [row.item_type, row.week ?? "", row.day ?? "", row.title].join("::");
  return [row.item_type, row.title].join("::");
}

function withAuditDefaults(row: SeedRow, userId: string, fallbackSortOrder: number) {
  const sortOrder = Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : fallbackSortOrder;
  return { ...row, sort_order: sortOrder, created_by: userId, updated_by: userId };
}

async function insertMissingRows(table: string, rows: SeedRow[], getKey: (row: SeedRow) => string, userId: string) {
  const existingProjection = table === "production_finish_line_items" ? "item_type,week,day,title" : "id";
  const { data, error } = await getAdminDatabaseClient().from(table).select(existingProjection);
  if (error) throw error;
  const existing = new Set((data ?? []).map(getKey));
  const missing = rows.filter((row) => !existing.has(getKey(row)));
  if (!missing.length) return 0;
  const { error: insertError } = await getAdminDatabaseClient().from(table).insert(missing.map((row, index) => withAuditDefaults(row, userId, index + 1)));
  if (insertError) throw insertError;
  return missing.length;
}

async function upsertSeedRows(table: string, rows: SeedRow[], onConflict: string, userId: string) {
  const { error } = await getAdminDatabaseClient().from(table).upsert(rows.map((row, index) => withAuditDefaults(row, userId, index + 1)), { onConflict, ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

async function repairMissingDefaults(userId: string) {
  const itemSeeds = [
    ...gateSeeds.map((gate, index) => ({ ...gate, sort_order: index + 1 })),
    ...dailyTaskSeeds.map((task, index) => ({ ...task, sort_order: 100 + index + 1 })),
    ...reserveSeeds.map((item, index) => ({ ...item, sort_order: 300 + index + 1 })),
    ...betaSeeds.map((item, index) => ({ ...item, sort_order: 400 + index + 1 })),
    ...securitySeeds.map((item, index) => ({ ...item, sort_order: 500 + index + 1 })),
    { ...decisionSeed, sort_order: 900 },
  ];
  return {
    items: await insertMissingRows("production_finish_line_items", itemSeeds, itemKey, userId),
    access: await upsertSeedRows("production_access_tests", accessSeeds, "role_name,area_name", userId),
    qr: await upsertSeedRows("production_qr_claim_pilot", qrSeeds, "pilot_number", userId),
    commands: await upsertSeedRows("production_command_results", commandSeeds, "command", userId),
    prompts: await upsertSeedRows("production_search_readiness_prompts", searchPromptSeeds, "prompt", userId),
  };
}

async function ensureSeeded(userId: string) {
  await repairMissingDefaults(userId);
}

async function loadData() {
  const [items, access, qr, commands, prompts] = await Promise.all([
    getAdminDatabaseClient().from("production_finish_line_items").select(ITEM_FIELDS).order("sort_order"),
    getAdminDatabaseClient().from("production_access_tests").select(ACCESS_FIELDS).order("sort_order"),
    getAdminDatabaseClient().from("production_qr_claim_pilot").select(QR_FIELDS).order("pilot_number"),
    getAdminDatabaseClient().from("production_command_results").select(COMMAND_FIELDS).order("sort_order"),
    getAdminDatabaseClient().from("production_search_readiness_prompts").select(PROMPT_FIELDS).order("sort_order"),
  ]);
  const error = [items.error, access.error, qr.error, commands.error, prompts.error].find(Boolean);
  if (error) throw error;
  return { items: items.data, access: access.data, qr: qr.data, commands: commands.data, prompts: prompts.data };
}

export async function GET() {
  const auth = await requireAdminApiRole(allowed);
  if (auth.error) return auth.error;
  try {
    await ensureSeeded(auth.adminUser.user_id);
    return NextResponse.json({ success: true, data: await loadData() });
  } catch {
    return NextResponse.json({ success: false, error: "Could not load production finish line" }, { status: 500 });
  }
}

export async function POST() {
  const auth = await requireAdminApiRole(allowed);
  if (auth.error) return auth.error;
  try {
    const repaired = await repairMissingDefaults(auth.adminUser.user_id);
    return NextResponse.json({ success: true, repaired, data: await loadData() });
  } catch {
    return NextResponse.json({ success: false, error: "Could not repair production defaults" }, { status: 500 });
  }
}

const tableMap: Record<string, { table: string; fields: string }> = {
  items: { table: "production_finish_line_items", fields: ITEM_FIELDS },
  access: { table: "production_access_tests", fields: ACCESS_FIELDS },
  qr: { table: "production_qr_claim_pilot", fields: QR_FIELDS },
  commands: { table: "production_command_results", fields: COMMAND_FIELDS },
  prompts: { table: "production_search_readiness_prompts", fields: PROMPT_FIELDS },
};
const allowedFields = new Set(["status", "owner", "notes", "test_url", "codex_task_url", "github_pr_url", "last_checked", "expected_behavior", "actual_behavior", "location_id", "location_name", "address", "claim_code", "claim_url", "qr_verified", "postcard_printed", "mailed", "scanned", "claim_started", "claim_submitted", "claim_approved", "owner_dashboard_works", "last_run_date", "result", "runner", "expected_result", "actual_result", "issue_type", "reviewed_at"]);
const boundedTextFields = new Set(["owner","notes","test_url","codex_task_url","github_pr_url","expected_behavior","actual_behavior","location_name","address","claim_code","claim_url","result","runner","expected_result","actual_result","issue_type"]);

export async function PATCH(request: Request) {
  const auth = await requireAdminApiRole(allowed);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  const collection = tableMap[String(body?.collection ?? "")];
  const id = typeof body?.id === "string" && body.id.length <= 80 ? body.id : null;
  if (!collection || !id || !body?.updates || typeof body.updates !== "object") return NextResponse.json({ success: false, error: "Invalid update" }, { status: 400 });

  const updates = Object.fromEntries(
    Object.entries(body.updates)
      .filter(([key]) => allowedFields.has(key))
      .map(([key, value]) => [key, boundedTextFields.has(key) && typeof value === "string" ? value.slice(0, 8000) : value]),
  );
  if (!Object.keys(updates).length) return NextResponse.json({ success: false, error: "No allowed update fields" }, { status: 400 });

  const { data, error } = await getAdminDatabaseClient()
    .from(collection.table)
    .update({ ...updates, updated_by: auth.adminUser.user_id })
    .eq("id", id)
    .select(collection.fields)
    .single();
  if (error) return NextResponse.json({ success: false, error: "Could not update production finish line item" }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
