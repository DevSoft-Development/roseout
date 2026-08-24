import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl, stripeRequest, stripeV2Request } from "@/lib/stripe/server";

async function requireOrganizationAdmin(userId: string, organizationId: string) {
  const { data: membership, error } = await supabaseAdmin
    .from("organization_members")
    .select("role,status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return Boolean(membership && ["owner", "admin"].includes(String(membership.role || "").toLowerCase()));
}

async function createV2Account(input: { organizationId: string; email: string; displayName: string }) {
  return stripeV2Request<{ id: string }>("/core/accounts", {
    idempotencyKey: `organizer-connect-v2-account-${input.organizationId}`,
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
        organization_id: input.organizationId,
        platform: "theouthaven",
      },
      include: ["configuration.merchant", "requirements"],
    },
  });
}

async function createOnboardingLink(input: { accountId: string; apiVersion: string; organizationId: string }) {
  const siteUrl = getSiteUrl();
  const refreshUrl = `${siteUrl}/api/organizers/stripe-connect/onboard?organization_id=${encodeURIComponent(input.organizationId)}&refresh=1`;
  const returnUrl = `${siteUrl}/api/organizers/stripe-connect/return?organization_id=${encodeURIComponent(input.organizationId)}`;

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

async function handleOnboarding(request: NextRequest, organizationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  if (!organizationId) return NextResponse.json({ error: "Organization is required." }, { status: 400 });
  if (!(await requireOrganizationAdmin(user.id, organizationId))) {
    return NextResponse.json({ error: "You do not have permission to manage payments for this organization." }, { status: 403 });
  }

  const { data: organization, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .select("id,name,stripe_connect_account_id,stripe_connect_account_api_version")
    .eq("id", organizationId)
    .maybeSingle();
  if (organizationError) throw organizationError;
  if (!organization) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

  let accountId = String(organization.stripe_connect_account_id || "");
  let apiVersion = String(organization.stripe_connect_account_api_version || "");
  if (!accountId) {
    const account = await createV2Account({
      organizationId,
      email: user.email || "",
      displayName: String(organization.name || "TheOutHaven organizer"),
    });
    accountId = account.id;
    apiVersion = "v2";
    const { error } = await supabaseAdmin
      .from("organizations")
      .update({
        stripe_connect_account_id: accountId,
        stripe_connect_account_api_version: "v2",
        stripe_connect_onboarding_status: "pending",
        stripe_connect_details_submitted: false,
        stripe_connect_charges_enabled: false,
        stripe_connect_payouts_enabled: false,
        stripe_connect_updated_at: new Date().toISOString(),
      })
      .eq("id", organizationId);
    if (error) throw error;
  } else if (!apiVersion) {
    apiVersion = "v1";
  }

  const link = await createOnboardingLink({ accountId, apiVersion, organizationId });
  return NextResponse.redirect(link.url, 303);
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const organizationId = String(form.get("organization_id") || "").trim();
    return await handleOnboarding(request, organizationId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start Stripe onboarding." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = String(request.nextUrl.searchParams.get("organization_id") || "").trim();
    return await handleOnboarding(request, organizationId);
  } catch {
    const organizationId = String(request.nextUrl.searchParams.get("organization_id") || "").trim();
    return NextResponse.redirect(`${getSiteUrl()}/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&tab=payments&connect=error`);
  }
}
