import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl, stripeRequest } from "@/lib/stripe/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

    const form = await request.formData();
    const organizationId = String(form.get("organization_id") || "").trim();
    if (!organizationId) return NextResponse.json({ error: "Organization is required." }, { status: 400 });

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .select("role,status")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !["owner", "admin"].includes(String(membership.role || "").toLowerCase())) {
      return NextResponse.json({ error: "You do not have permission to manage payments for this organization." }, { status: 403 });
    }

    const { data: organization, error: organizationError } = await supabaseAdmin
      .from("organizations")
      .select("id,name,stripe_connect_account_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (organizationError) throw organizationError;
    if (!organization) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

    let accountId = String(organization.stripe_connect_account_id || "");
    if (!accountId) {
      const account = await stripeRequest<{ id: string }>("/accounts", {
        body: new URLSearchParams({
          type: "express",
          country: "US",
          email: user.email || "",
          "capabilities[card_payments][requested]": "true",
          "capabilities[transfers][requested]": "true",
          "metadata[organization_id]": organizationId,
          "business_profile[name]": organization.name || "TheOutHaven organizer",
        }),
        idempotencyKey: `organizer-connect-account-${organizationId}`,
      });
      accountId = account.id;
      const { error } = await supabaseAdmin
        .from("organizations")
        .update({ stripe_connect_account_id: accountId, stripe_connect_onboarding_status: "pending" })
        .eq("id", organizationId);
      if (error) throw error;
    }

    const siteUrl = getSiteUrl();
    const link = await stripeRequest<{ url: string }>("/account_links", {
      body: new URLSearchParams({
        account: accountId,
        type: "account_onboarding",
        refresh_url: `${siteUrl}/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&tab=payments&connect=refresh`,
        return_url: `${siteUrl}/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&tab=payments&connect=return`,
      }),
    });

    return NextResponse.redirect(link.url, 303);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start Stripe onboarding." }, { status: 500 });
  }
}
