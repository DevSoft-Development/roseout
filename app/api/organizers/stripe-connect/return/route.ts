import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl, stripeRequest } from "@/lib/stripe/server";

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
    .select("stripe_connect_account_id")
    .eq("id", organizationId)
    .maybeSingle();
  const accountId = String(organization?.stripe_connect_account_id || "");
  if (!accountId) return NextResponse.redirect(`${siteUrl}/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&tab=payments&connect=missing`);

  try {
    const account = await stripeRequest<any>(`/accounts/${encodeURIComponent(accountId)}`, { method: "GET" });
    const ready = Boolean(account.details_submitted && account.charges_enabled && account.payouts_enabled);
    const { error } = await supabaseAdmin.from("organizations").update({
      stripe_connect_onboarding_status: ready ? "complete" : account.details_submitted ? "restricted" : "pending",
      stripe_connect_details_submitted: Boolean(account.details_submitted),
      stripe_connect_charges_enabled: Boolean(account.charges_enabled),
      stripe_connect_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_connect_updated_at: new Date().toISOString(),
    }).eq("id", organizationId);
    if (error) throw error;
    return NextResponse.redirect(`${siteUrl}/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&tab=payments&connect=${ready ? "ready" : "incomplete"}`);
  } catch {
    return NextResponse.redirect(`${siteUrl}/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&tab=payments&connect=error`);
  }
}
