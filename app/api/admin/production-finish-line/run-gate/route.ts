import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { runSafeGateTest, type GateRunResult } from "@/lib/production-finish-line/gate-tests";

export const dynamic = "force-dynamic";

const allowed = ADMIN_PAGE_ACCESS.productionFinishLine;
const AUTOMATED_BLOCK_START = "[Automated gate test";
const AUTOMATED_BLOCK_PATTERN = /\n?\[Automated gate test[^]*?(?=\n\n(?!- )|$)/;

type GateRow = Record<string, any>;

function formatAutomatedBlock(result: GateRunResult, checkedAt: string) {
  const checks = result.checks
    .map((check) => `- ${check.name}: ${check.status.replaceAll("_", " ")} — ${check.details}`)
    .join("\n");

  return `[Automated gate test - ${checkedAt}]\nStatus: ${result.status}\nSummary: ${result.summary}\nChecks:\n${checks}`;
}

function mergeNotes(existingNotes: string | null | undefined, result: GateRunResult, checkedAt: string) {
  const manualNotes = String(existingNotes ?? "").replace(AUTOMATED_BLOCK_PATTERN, "").trim();
  const automated = formatAutomatedBlock(result, checkedAt);
  const next = [manualNotes, automated].filter(Boolean).join("\n\n");
  return next.length > 8000 ? next.slice(0, 7800) + "\n\n[Automated gate test truncated]" : next;
}

async function loadGates(body: any) {
  if (body?.mode === "all_p0") {
    const { data, error } = await supabaseAdmin
      .from("production_finish_line_items")
      .select("*")
      .eq("item_type", "gate")
      .eq("priority", "P0")
      .order("sort_order");
    if (error) throw error;
    return data ?? [];
  }

  const gateId = typeof body?.gateId === "string" ? body.gateId : null;
  if (!gateId) throw new Error("Missing gateId");

  const { data, error } = await supabaseAdmin
    .from("production_finish_line_items")
    .select("*")
    .eq("id", gateId)
    .eq("item_type", "gate")
    .single();
  if (error) throw error;
  return data ? [data] : [];
}

async function runAndSaveGate(gate: GateRow, userId: string) {
  const checkedAt = new Date().toISOString();
  const result = await runSafeGateTest(String(gate.title ?? "Unknown gate"), supabaseAdmin);
  const notes = mergeNotes(gate.notes, result, checkedAt);

  const { data, error } = await supabaseAdmin
    .from("production_finish_line_items")
    .update({
      status: result.status,
      notes,
      last_checked: checkedAt,
      updated_by: userId,
    })
    .eq("id", gate.id)
    .select("*")
    .single();

  if (error) throw error;

  return {
    gateId: gate.id,
    title: result.title,
    status: result.status,
    summary: result.summary,
    checks: result.checks,
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
    for (const gate of gates) {
      results.push(await runAndSaveGate(gate, auth.adminUser.user_id));
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message ?? "Could not run gate test" }, { status: 500 });
  }
}
