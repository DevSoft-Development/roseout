import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl } from "@/lib/stripe/server";
import { connectStateUpdate, retrieveConnectAccountState } from "@/lib/stripe/connect-status";

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
    const state = await retrieveConnectAccountState(accountId, apiVersion);
    const { error } = await supabaseAdmin
      .from("organizations")
      .update(connectStateUpdate(state))
      .eq("id", organizationId);
    if (error) throw error;

    return NextResponse.redirect(`${siteUrl}/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&tab=payments&connect=${state.ready ? "ready" : state.requiresAction ? "action_required" : "incomplete"}`);
  } catch {
    return NextResponse.redirect(`${siteUrl}/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&tab=payments&connect=error`);
  }
}
