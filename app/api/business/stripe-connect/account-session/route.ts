import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import {
  getStripeModeForLocation,
  getStripePublishableKey,
  stripeRequest,
  stripeV2Request,
  type StripeMode,
} from "@/lib/stripe/server";

function locationName(location: any) {
  return String(location?.name || location?.restaurant_name || location?.activity_name || "TheOutHaven Location").trim();
}

async function createV2Account(input: { locationId: string; email: string; displayName: string; mode: StripeMode }) {
  return stripeV2Request<{ id: string }>("/core/accounts", {
    mode: input.mode,
    idempotencyKey: `connect-v2-account-${input.mode}-${input.locationId}`,
    body: {
      contact_email: input.email || undefined,
      display_name: input.displayName,
      identity: { country: "US" },
      dashboard: "full",
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { requested: true },
          },
        },
      },
      defaults: {
        currency: "usd",
        locales: ["en-US"],
        responsibilities: {
          fees_collector: "stripe",
          losses_collector: "stripe",
        },
      },
      metadata: {
        location_id: input.locationId,
        platform: "theouthaven",
        stripe_mode: input.mode,
      },
      include: ["configuration.merchant", "requirements"],
    },
  });
}

function accountSessionBody(accountId: string) {
  return new URLSearchParams({
    account: accountId,
    "components[account_onboarding][enabled]": "true",
    "components[account_management][enabled]": "true",
    "components[notification_banner][enabled]": "true",
    "components[payments][enabled]": "true",
    "components[payments][features][refund_management]": "true",
    "components[payments][features][dispute_management]": "true",
    "components[payments][features][capture_payments]": "true",
    "components[payouts][enabled]": "true",
    "components[disputes_list][enabled]": "true",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const locationId = String(body.location_id || "").trim();
    if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

    const authorized = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
    if (!authorized) return NextResponse.json({ error: "Location not found." }, { status: 404 });

    const location = authorized.location as Record<string, any>;
    const mode = getStripeModeForLocation(location);
    let accountId = String(location.stripe_connect_account_id || "").trim();
    let apiVersion = String(location.stripe_connect_account_api_version || "").trim();

    if (!accountId) {
      const account = await createV2Account({
        locationId,
        email: user.email || location.owner_email || "",
        displayName: locationName(location),
        mode,
      });
      accountId = account.id;
      apiVersion = "v2";
      const { error } = await supabaseAdmin.from("locations").update({
        stripe_connect_account_id: accountId,
        stripe_connect_account_api_version: "v2",
        stripe_connect_onboarding_status: "pending",
        stripe_connect_details_submitted: false,
        stripe_connect_charges_enabled: false,
        stripe_connect_payouts_enabled: false,
        stripe_connect_updated_at: new Date().toISOString(),
      }).eq("id", locationId);
      if (error) throw error;
    } else if (!apiVersion) {
      apiVersion = "v1";
    }

    if (apiVersion !== "v2" && mode === "test") {
      return NextResponse.json({ error: "This demo location has a legacy Stripe account. Reset the demo Stripe connection and try again." }, { status: 409 });
    }

    const session = await stripeRequest<{ client_secret: string }>("/account_sessions", {
      mode,
      body: accountSessionBody(accountId),
      idempotencyKey: `embedded-connect-session-${mode}-${locationId}-${Date.now()}`,
    });

    return NextResponse.json({
      client_secret: session.client_secret,
      publishable_key: getStripePublishableKey(mode),
      mode,
      account_id: accountId,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to initialize Stripe Connect." }, { status: 500 });
  }
}
