import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getSiteUrl, stripeRequest, stripeV2Request } from "@/lib/stripe/server";

function locationName(location: any) {
  return String(location?.name || location?.restaurant_name || location?.activity_name || "TheOutHaven Location").trim();
}

async function createV2Account(input: { locationId: string; email: string; displayName: string }) {
  return stripeV2Request<{ id: string }>("/core/accounts", {
    idempotencyKey: `connect-v2-account-${input.locationId}`,
    body: {
      contact_email: input.email || undefined,
      display_name: input.displayName,
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
      },
      include: ["configuration.merchant", "requirements"],
    },
  });
}

async function createOnboardingLink(input: { accountId: string; apiVersion: string; locationId: string }) {
  const siteUrl = getSiteUrl();
  const refreshUrl = `${siteUrl}/api/business/stripe-connect/onboard?location_id=${encodeURIComponent(input.locationId)}&refresh=1`;
  const returnUrl = `${siteUrl}/api/business/stripe-connect/return?location_id=${encodeURIComponent(input.locationId)}`;

  if (input.apiVersion === "v2") {
    return stripeV2Request<{ url: string }>("/core/account_links", {
      body: {
        account: input.accountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            collection_options: { fields: "eventually_due" },
            configurations: ["merchant"],
            refresh_url: refreshUrl,
            return_url: returnUrl,
          },
        },
      },
    });
  }

  return stripeRequest<{ url: string }>("/account_links", {
    body: new URLSearchParams({
      account: input.accountId,
      type: "account_onboarding",
      refresh_url: refreshUrl,
      return_url: returnUrl,
    }),
  });
}

async function handleOnboarding(request: NextRequest, locationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });

  const authorized = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!authorized) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  let accountId = String(authorized.location.stripe_connect_account_id || "");
  let apiVersion = String(authorized.location.stripe_connect_account_api_version || "");

  if (!accountId) {
    const account = await createV2Account({
      locationId,
      email: user.email || authorized.location.owner_email || "",
      displayName: locationName(authorized.location),
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

  const link = await createOnboardingLink({ accountId, apiVersion, locationId });
  return NextResponse.redirect(link.url, 303);
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const locationId = String(form.get("location_id") || "").trim();
    return await handleOnboarding(request, locationId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start Stripe onboarding." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const locationId = String(request.nextUrl.searchParams.get("location_id") || "").trim();
    return await handleOnboarding(request, locationId);
  } catch {
    return NextResponse.redirect(`${getSiteUrl()}/locations/dashboard/billing?connect=error`);
  }
}
