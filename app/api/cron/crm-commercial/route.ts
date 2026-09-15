import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { reconcileCreatorPartnerProgram } from "@/lib/creator-partners/reconcile";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const period = today.slice(0, 7);

  const { data: snapshot, error } = await supabaseAdmin.rpc("crm_snapshot_forecast", { p_snapshot_date: today, p_period_key: period });
  if (error) return NextResponse.json({ error: "Snapshot failed" }, { status: 500 });

  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + 120);
  const { data: accounts, error: renewalError } = await supabaseAdmin.from("crm_accounts").select("id,name,owner_user_id,renewal_date").not("renewal_date", "is", null).lte("renewal_date", horizon.toISOString().slice(0, 10)).gte("renewal_date", today).is("archived_at", null).limit(500);
  if (renewalError) return NextResponse.json({ error: "Renewal scan failed" }, { status: 500 });

  let renewalsCreated = 0;
  let duplicatesPrevented = 0;
  for (const account of accounts ?? []) {
    const source = `account-renewal:${account.id}:${account.renewal_date}`;
    const { data: prior } = await supabaseAdmin.from("crm_opportunities").select("id").eq("source_system", "crm_renewal_job").eq("source_record_id", source).maybeSingle();
    if (prior) { duplicatesPrevented += 1; continue; }
    const { error: insertError } = await supabaseAdmin.from("crm_opportunities").insert({ account_id: account.id, name: `${account.name} renewal`, pipeline_key: "renewal_expansion", stage: "upcoming", status: "open", forecast_category: "pipeline", probability: 25, expected_close_date: account.renewal_date, owner_user_id: account.owner_user_id, source_system: "crm_renewal_job", source_record_id: source });
    if (!insertError) renewalsCreated += 1;
  }

  let creatorPartners: Awaited<ReturnType<typeof reconcileCreatorPartnerProgram>> | { error: string };
  try {
    creatorPartners = await reconcileCreatorPartnerProgram();
  } catch (creatorError) {
    console.error("CREATOR_PARTNER_RECONCILIATION_FAILED", creatorError);
    creatorPartners = { error: creatorError instanceof Error ? creatorError.message : "Creator Partner reconciliation failed" };
  }

  console.info("CRM_COMMERCIAL_DAILY", { snapshot_rows: snapshot, renewals_created: renewalsCreated, duplicates_prevented: duplicatesPrevented, creator_partners: creatorPartners, duration_ms: Date.now() - started });
  return NextResponse.json({ ok: true, snapshotRows: snapshot, renewalsCreated, duplicatesPrevented, creatorPartners, durationMs: Date.now() - started });
}
