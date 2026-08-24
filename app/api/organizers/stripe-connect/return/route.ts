import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl, stripeRequest, stripeV2Request } from "@/lib/stripe/server";

function v2OnboardingState(account: any) {
  const merchant = account?.configuration?.merchant;
  const cardStatus = String(merchant?.capabilities?.card_payments?.status || "inactive");
  const payoutStatus = String(merchant?.capabilities?.stripe_balance?.payouts?.status || "inactive");
  const chargesEnabled = cardStatus === "active";
  const payoutsEnabled = payoutStatus === "active";
  const ready = chargesEnabled && payoutsEnabled;
  return {
    ready,
    detailsSubmitted: ready,
    chargesEnabled,
    payoutsEnabled,
    onboardingStatus: ready ? "complete" : cardStatus === "restricted" || payoutStatus === "restricted" ? "restricted" : "pending",
  };
}

export async function GET(request: NextRequest) {
  const organizationId = String(request.nextUrl.searchParams.get("organization_id") || "").trim();
  const siteUrl = getSiteUrl();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl}/login`);
  if (!organizationId) return NextResponse.redirect(`${siteUrl}/organizers/dashboard?connect=missing`);

  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role,status")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes(String(membership.role || "").toLowerCase())) {
    return NextResponse.redirect(`${siteUrl}/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&tab=payments&connect=forbidden`);
  }

  const { data: organization } = await supabaseAdmin
    .from("organizations")
    .select("stripe_connect_account_id,stripe_connect_account_api_version")
    .eq("id", organizationId)
    .maybeSingle();
  const accountId = String(organization?.stripe_connect_account_id || "");
  const apiVersion = String(organization?.stripe_connect_account_api_version || "v1");
  if (!accountId) return NextResponse.redirect(`${siteUrl}/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&tab=payments&connect=missing`);

  try {
    let state: ReturnType<typeof v2OnboardingState>;
    if (apiVersion === "v2") {
      const query = new URLSearchParams();
      query.append("include[0]", "configuration.merchant");
      query.append("include[1]", "requirements");
      const account = await stripeV2Request<any>(`/core/accounts/${encodeURIComponent(accountId)}?${query.toString()}`, { method: "GET" });
      state = v2OnboardingState(account);
    } else {
      const account = await stripeRequest<any>(`/accounts/${encodeURIComponent(accountId)}`, { method: "GET" });
      const ready = Boolean(account.details_submitted && account.charges_enabled && account.payouts_enabled);
      state = {
        ready,
        detailsSubmitted: Boolean(account.details_submitted),
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
        onboardingStatus: ready ? "complete" : account.details_submitted ? "restricted" : "pending",
      };
    }

    const { error } = await supabaseAdmin.from("organizations").update({
      stripe_connect_onboarding_status: state.onboardingStatus,
      stripe_connect_details_submitted: state.detailsSubmitted,
      stripe_connect_charges_enabled: state.chargesEnabled,
      stripe_connect_payouts_enabled: state.payoutsEnabled,
      stripe_connect_updated_at: new Date().toISOString(),
    }).eq("id", organizationId);
    if (error) throw error;
    return NextResponse.redirect(`${siteUrl}/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&tab=payments&connect=${state.ready ? "ready" : "incomplete"}`);
  } catch {
    return NextResponse.redirect(`${siteUrl}/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&tab=payments&connect=error`);
  }
}
