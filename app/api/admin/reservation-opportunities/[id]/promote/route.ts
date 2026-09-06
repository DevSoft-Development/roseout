import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createAccount } from "@/lib/crm/accounts";
import { createOpportunity } from "@/lib/crm/opportunities/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.crmEdit);
  if (auth.error) return auth.error;
  if (!auth.adminUser) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const actor = auth.adminUser;
  const { id } = await params;

  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("id,name,website,phone,reservation_upgrade_opportunity,reservation_opportunity_tier,reservation_opportunity_classification,reservation_opportunity_score")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (locationError) {
    return NextResponse.json({ success: false, error: locationError.message }, { status: 500 });
  }
  if (!location) {
    return NextResponse.json({ success: false, error: "Reserve opportunity not found" }, { status: 404 });
  }

  const eligible =
    location.reservation_upgrade_opportunity === true &&
    location.reservation_opportunity_tier === "high" &&
    location.reservation_opportunity_classification === "no_online_reservations";

  if (!eligible) {
    return NextResponse.json(
      { success: false, error: "Only verified High Reserve opportunities can be added to CRM" },
      { status: 409 },
    );
  }

  const { data: existingLink } = await supabaseAdmin
    .from("crm_account_locations")
    .select("account_id")
    .eq("location_id", location.id)
    .neq("status", "inactive")
    .limit(1)
    .maybeSingle();

  let accountId = existingLink?.account_id ?? null;
  let accountCreated = false;

  if (!accountId) {
    const { data: existingAccount } = await supabaseAdmin
      .from("crm_accounts")
      .select("id")
      .eq("external_reference", location.id)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    accountId = existingAccount?.id ?? null;
  }

  if (!accountId) {
    const account = await createAccount(
      {
        name: location.name || "Unnamed restaurant",
        accountType: "independent_business",
        lifecycleStage: "prospect",
      },
      actor,
    );
    accountId = account.id;
    accountCreated = true;

    await supabaseAdmin
      .from("crm_accounts")
      .update({
        website: location.website || null,
        phone: location.phone || null,
        source: "reserve_opportunity",
        source_detail: `Reserve score ${location.reservation_opportunity_score ?? 0}/100`,
        external_reference: location.id,
        next_action: "Review Reserve fit and begin outreach",
        updated_by: actor.user_id,
      })
      .eq("id", accountId);
  }

  if (!existingLink) {
    const { error: linkError } = await supabaseAdmin.from("crm_account_locations").insert({
      account_id: accountId,
      location_id: location.id,
      relationship_type: "operating_location",
      is_primary_location: true,
      status: "active",
      source: "reserve_opportunity",
      metadata: {
        reserve_score: location.reservation_opportunity_score ?? 0,
        reserve_tier: location.reservation_opportunity_tier,
        reserve_classification: location.reservation_opportunity_classification,
      },
    });
    if (linkError) {
      return NextResponse.json({ success: false, error: linkError.message }, { status: 500 });
    }
  }

  const { data: existingOpportunity } = await supabaseAdmin
    .from("crm_opportunities")
    .select("id")
    .eq("primary_location_id", location.id)
    .eq("pipeline_key", "reserve_pro")
    .eq("status", "open")
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();

  let opportunityId = existingOpportunity?.id ?? null;
  let opportunityCreated = false;

  if (!opportunityId) {
    const opportunity = await createOpportunity(
      {
        account_id: accountId,
        name: `TheOutHaven Reserve — ${location.name || "Restaurant"}`,
        pipeline_key: "reserve_pro",
        primary_location_id: location.id,
      },
      actor,
    );
    opportunityId = opportunity.id;
    opportunityCreated = true;

    await supabaseAdmin
      .from("crm_opportunities")
      .update({
        product_key: "reserve",
        lead_source: "reserve_opportunity_scoring",
        next_step: "Review evidence and begin outreach",
        metadata: {
          reserve_score: location.reservation_opportunity_score ?? 0,
          reserve_tier: location.reservation_opportunity_tier,
          reserve_classification: location.reservation_opportunity_classification,
        },
      })
      .eq("id", opportunityId);
  }

  return NextResponse.json({
    success: true,
    accountId,
    opportunityId,
    accountCreated,
    opportunityCreated,
    accountUrl: `/admin/dashboard/crm/accounts/${accountId}`,
    opportunityUrl: `/admin/dashboard/crm/opportunities/${opportunityId}`,
  });
}
