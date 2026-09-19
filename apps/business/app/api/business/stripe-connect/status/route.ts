import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getStripeModeForLocation } from "@/lib/stripe/server";
import {
  connectStateUpdate,
  retrieveConnectAccountState,
} from "@/lib/stripe/connect-status";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const locationId = String(body.location_id || "").trim();
    if (!locationId) {
      return NextResponse.json({ error: "Missing location." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }

    const authorized = await requireOwnerOrAdminAccessToLocation(
      user.id,
      locationId,
    );
    if (!authorized) {
      return NextResponse.json({ error: "Location not found." }, { status: 404 });
    }

    const location = authorized.location as Record<string, any>;
    const accountId = String(location.stripe_connect_account_id || "").trim();
    if (!accountId) {
      return NextResponse.json({
        connected: false,
        ready: false,
        onboardingStatus: "not_connected",
      });
    }

    const apiVersion = String(
      location.stripe_connect_account_api_version || "v1",
    );
    const mode = getStripeModeForLocation(location);
    const state = await retrieveConnectAccountState(accountId, apiVersion, mode);

    const { error } = await supabaseAdmin
      .from("locations")
      .update(connectStateUpdate(state))
      .eq("id", locationId);
    if (error) throw error;

    return NextResponse.json({
      connected: true,
      mode,
      accountId,
      ...state,
    });
  } catch (error) {
    console.error("Stripe Connect status refresh failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to refresh Stripe Connect status.",
      },
      { status: 500 },
    );
  }
}
