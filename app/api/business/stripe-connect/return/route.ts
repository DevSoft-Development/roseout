import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
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
  const locationId = request.nextUrl.searchParams.get("location_id") || "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${getSiteUrl()}/login`);
  const authorized = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!authorized?.location.stripe_connect_account_id) return NextResponse.redirect(`${getSiteUrl()}/business/dashboard/billing?connect=missing`);
  try {
    const accountId = String(authorized.location.stripe_connect_account_id);
    const apiVersion = String(authorized.location.stripe_connect_account_api_version || "v1");

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

    const { error } = await supabaseAdmin.from("locations").update({
      stripe_connect_onboarding_status: state.onboardingStatus,
      stripe_connect_details_submitted: state.detailsSubmitted,
      stripe_connect_charges_enabled: state.chargesEnabled,
      stripe_connect_payouts_enabled: state.payoutsEnabled,
      stripe_connect_updated_at: new Date().toISOString(),
    }).eq("id", locationId);
    if (error) throw error;
    return NextResponse.redirect(`${getSiteUrl()}/business/dashboard/billing?location=${encodeURIComponent(locationId)}&connect=${state.ready ? "ready" : "incomplete"}`);
  } catch {
    return NextResponse.redirect(`${getSiteUrl()}/business/dashboard/billing?location=${encodeURIComponent(locationId)}&connect=error`);
  }
}
