import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getSiteUrl } from "@/lib/stripe/server";
import { connectStateUpdate, retrieveConnectAccountState } from "@/lib/stripe/connect-status";

export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get("location_id") || "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${getSiteUrl()}/login`);
  const authorized = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!authorized?.location.stripe_connect_account_id) return NextResponse.redirect(`${getSiteUrl()}/locations/dashboard/billing?connect=missing`);

  try {
    const accountId = String(authorized.location.stripe_connect_account_id);
    const apiVersion = String(authorized.location.stripe_connect_account_api_version || "v1");
    const state = await retrieveConnectAccountState(accountId, apiVersion);

    const { error } = await supabaseAdmin
      .from("locations")
      .update(connectStateUpdate(state))
      .eq("id", locationId);
    if (error) throw error;

    return NextResponse.redirect(`${getSiteUrl()}/locations/dashboard/billing?connect=${state.ready ? "ready" : state.requiresAction ? "action_required" : "incomplete"}`);
  } catch {
    return NextResponse.redirect(`${getSiteUrl()}/locations/dashboard/billing?connect=error`);
  }
}
