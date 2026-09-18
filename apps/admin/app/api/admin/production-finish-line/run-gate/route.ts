import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { runSafeGateTest, type GateRunResult } from "@/lib/production-finish-line/gate-tests";

export const dynamic = "force-dynamic";

const allowed = ADMIN_PAGE_ACCESS.productionFinishLine;
const AUTOMATED_BLOCK_PATTERN = /\n?\[Automated gate test[^]*?(?=\n\n(?!- )|$)/;
const GATE_FIELDS = "id,item_type,title,priority,status,notes,last_checked,sort_order,updated_at";

type GateRow = Record<string, any>;

function formatAutomatedBlock(result: GateRunResult, checkedAt: string) {
  const checks = result.checks
    .map((check) => `- ${String(check.name).slice(0, 160)}: ${String(check.status).replaceAll("_", " ").slice(0, 80)} — ${String(check.details).slice(0, 1000)}`)
    .join("\n");
  return `[Automated gate test - ${checkedAt}]\nStatus: ${String(result.status).slice(0, 80)}\nSummary: ${String(result.summary).slice(0, 2000)}\nChecks:\n${checks}`;
}

function mergeNotes(existingNotes: string | null | undefined, result: GateRunResult, checkedAt: string) {
  const manualNotes = String(existingNotes ?? "").replace(AUTOMATED_BLOCK_PATTERN, "").trim().slice(0, 4000);
  const automated = formatAutomatedBlock(result, checkedAt);
  const next = [manualNotes, automated].filter(Boolean).join("\n\n");
  return next.length > 8000 ? next.slice(0, 7800) + "\n\n[Automated gate test truncated]" : next;
}

async function loadGates(body: any) {
  if (body?.mode === "all_p0") {
    const { data, error } = await getAdminDatabaseClient()
      .from("production_finish_line_items")
      .select(GATE_FIELDS)
      .eq("item_type", "gate")
      .eq("priority", "P0")
      .order("sort_order");
    if (error) throw error;
    return data ?? [];
  }

  const gateId = typeof body?.gateId === "string" && body.gateId.length <= 80 ? body.gateId : null;
  if (!gateId) throw new Error("Missing gateId");
  const { data, error } = await getAdminDatabaseClient()
    .from("production_finish_line_items")
    .select(GATE_FIELDS)
    .eq("id", gateId)
    .eq("item_type", "gate")
    .single();
  if (error) throw error;
  return data ? [data] : [];
}

async function runAndSaveGate(gate: GateRow, userId: string) {
  const checkedAt = new Date().toISOString();
  const result = await runSafeGateTest(String(gate.title ?? "Unknown gate"), getAdminDatabaseClient());
  const notes = mergeNotes(gate.notes, result, checkedAt);
  const { data, error } = await getAdminDatabaseClient()
    .from("production_finish_line_items")
    .update({ status: result.status, notes, last_checked: checkedAt, updated_by: userId })
    .eq("id", gate.id)
    .select(GATE_FIELDS)
    .single();
  if (error) throw error;
  return {
    gateId: gate.id,
    title: String(result.title).slice(0, 240),
    status: result.status,
    summary: String(result.summary).slice(0, 2000),
    checks: result.checks.map((check) => ({
      name: String(check.name).slice(0, 160),
      status: check.status,
      details: String(check.details).slice(0, 1000),
    })),
    gate: data,
  };
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(allowed);
  if (auth.error) return auth.error;
  try {
    const body = await request.json().catch(() => ({}));
    const gates = await loadGates(body);
    if (!gates.length) return NextResponse.json({ success: false, error: "No matching gates found" }, { status: 404 });
    const results = [];
    for (const gate of gates) results.push(await runAndSaveGate(gate, auth.adminUser.user_id));
    return NextResponse.json({ success: true, results });
  } catch {
    return NextResponse.json({ success: false, error: "Could not run gate test" }, { status: 500 });
  }
}
