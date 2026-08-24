import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { connectStateUpdate, retrieveConnectAccountState } from "@/lib/stripe/connect-status";

export const dynamic = "force-dynamic";

async function syncTable(table: "locations" | "organizations", limit: number) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id,stripe_connect_account_id,stripe_connect_account_api_version")
    .not("stripe_connect_account_id", "is", null)
    .order("stripe_connect_updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw error;

  let updated = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const row of data || []) {
    const id = String(row.id || "");
    const accountId = String(row.stripe_connect_account_id || "");
    const apiVersion = String(row.stripe_connect_account_api_version || "v1");
    if (!id || !accountId) continue;

    try {
      const state = await retrieveConnectAccountState(accountId, apiVersion);
      const result = await supabaseAdmin
        .from(table)
        .update(connectStateUpdate(state))
        .eq("id", id);
      if (result.error) throw result.error;
      updated += 1;
    } catch (error) {
      failures.push({ id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { scanned: (data || []).length, updated, failures };
}

export async function GET(request: NextRequest) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 100);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 100, 1), 200);

  try {
    const [locations, organizations] = await Promise.all([
      syncTable("locations", limit),
      syncTable("organizations", limit),
    ]);

    return NextResponse.json({
      success: true,
      locations,
      organizations,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
