import { NextResponse } from "next/server";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { runHostingDrSimulation } from "@/lib/hosting/dr-simulation";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await requireAdminRole(["superadmin", "admin"]);

  const { data, error } = await getAdminDatabaseClient()
    .from("hosting_dr_test_runs")
    .select("id,created_at,mode,status,source_node_id,target_node_id,site_count,pass_count,warn_count,fail_count,summary,results")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: "Unable to load the latest DR test result." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, run: data || null });
}

export async function POST() {
  await requireAdminRole(["superadmin", "admin"]);

  try {
    const run = await runHostingDrSimulation();
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    console.error("hosting_dr_simulation_failed", error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Hosting DR simulation failed.",
    }, { status: 500 });
  }
}
