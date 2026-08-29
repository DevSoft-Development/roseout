import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { accessSeeds, betaSeeds, commandSeeds, dailyTaskSeeds, decisionSeed, gateSeeds, qrSeeds, reserveSeeds, searchPromptSeeds, securitySeeds } from "@/lib/production-finish-line/seeds";

export const dynamic = "force-dynamic";
const allowed = ADMIN_PAGE_ACCESS.productionFinishLine;

type SeedRow = Record<string, any>;

type SeedOptions = {
  includeSortOrder?: boolean;
};

function itemKey(row: SeedRow) {
  if (row.item_type === "daily_task") return [row.item_type, row.week ?? "", row.day ?? "", row.title].join("::");
  return [row.item_type, row.title].join("::");
}

function existingItemKey(row: SeedRow) {
  return itemKey(row);
}

function withAuditDefaults(row: SeedRow, userId: string, fallbackSortOrder: number, options: SeedOptions = { includeSortOrder: true }): SeedRow {
  const next: SeedRow = {
    ...row,
    created_by: userId,
    updated_by: userId,
  };

  if (options.includeSortOrder !== false) {
    next.sort_order = Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : fallbackSortOrder;
  }

  return next;
}

async function insertMissingRows(table: string, rows: SeedRow[], getKey: (row: SeedRow) => string, userId: string, options?: SeedOptions) {
  const { data, error } = await supabaseAdmin.from(table).select("*");
  if (error) throw error;

  const existing = new Set((data ?? []).map(getKey));
  const missing = rows.filter((row) => !existing.has(getKey(row)));
  if (!missing.length) return 0;

  const { error: insertError } = await supabaseAdmin
    .from(table)
    .insert(missing.map((row, index) => withAuditDefaults(row, userId, index + 1, options)));
  if (insertError) throw insertError;
  return missing.length;
}

async function upsertSeedRows(table: string, rows: SeedRow[], onConflict: string, userId: string, options?: SeedOptions) {
  const { error } = await supabaseAdmin
    .from(table)
    .upsert(rows.map((row, index) => withAuditDefaults(row, userId, index + 1, options)), { onConflict, ignoreDuplicates: true });
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

  const repaired = {
    items: await insertMissingRows("production_finish_line_items", itemSeeds, existingItemKey, userId),
    access: await upsertSeedRows("production_access_tests", accessSeeds, "role_name,area_name", userId),
    qr: await upsertSeedRows("production_qr_claim_pilot", qrSeeds, "pilot_number", userId, { includeSortOrder: false }),
    commands: await upsertSeedRows("production_command_results", commandSeeds, "command", userId),
    prompts: await upsertSeedRows("production_search_readiness_prompts", searchPromptSeeds, "prompt", userId),
  };

  return repaired;
}

async function ensureSeeded(userId: string) {
  await repairMissingDefaults(userId);
}

async function loadData() {
  const [items, access, qr, commands, prompts] = await Promise.all([
    supabaseAdmin.from("production_finish_line_items").select("*").order("sort_order"),
    supabaseAdmin.from("production_access_tests").select("*").order("sort_order"),
    supabaseAdmin.from("production_qr_claim_pilot").select("*").order("pilot_number"),
    supabaseAdmin.from("production_command_results").select("*").order("sort_order"),
    supabaseAdmin.from("production_search_readiness_prompts").select("*").order("sort_order"),
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
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message ?? "Could not load production finish line" }, { status: 500 });
  }
}

export async function POST() {
  const auth = await requireAdminApiRole(allowed);
  if (auth.error) return auth.error;
  try {
    const repaired = await repairMissingDefaults(auth.adminUser.user_id);
    return NextResponse.json({ success: true, repaired, data: await loadData() });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message ?? "Could not repair production defaults" }, { status: 500 });
  }
}

const tableMap: Record<string, string> = { items: "production_finish_line_items", access: "production_access_tests", qr: "production_qr_claim_pilot", commands: "production_command_results", prompts: "production_search_readiness_prompts" };
const allowedFields = new Set(["status", "owner", "notes", "test_url", "codex_task_url", "github_pr_url", "last_checked", "expected_behavior", "actual_behavior", "location_id", "location_name", "address", "claim_code", "claim_url", "qr_verified", "postcard_printed", "mailed", "scanned", "claim_started", "claim_submitted", "claim_approved", "owner_dashboard_works", "last_run_date", "result", "runner", "expected_result", "actual_result", "issue_type", "reviewed_at"]);
export async function PATCH(request: Request) {
  const auth = await requireAdminApiRole(allowed);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  const table = tableMap[String(body?.collection ?? "")];
  const id = typeof body?.id === "string" ? body.id : null;
  if (!table || !id || !body?.updates || typeof body.updates !== "object") return NextResponse.json({ success: false, error: "Invalid update" }, { status: 400 });
  const updates = Object.fromEntries(Object.entries(body.updates).filter(([key]) => allowedFields.has(key)));
  const { data, error } = await supabaseAdmin.from(table).update({ ...updates, updated_by: auth.adminUser.user_id }).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
