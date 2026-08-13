import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDomainBenefitSettings } from "@/lib/domains/benefit-settings";
import { quoteDomain, searchDomain } from "@/lib/domains/gateway";

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const INTERNAL_INCLUDED_DOMAIN_MAX_WHOLESALE_USD = 20;
const ACTIVE_PARTNER_PRO_STATUSES = new Set(["active", "trialing"]);

function publicResult(domain: string, included: boolean, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ domain, included, code, message, ...extra });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please log in to check domain eligibility." }, { status: 401 });

    const payload = await request.json().catch(() => ({}));
    const locationId = String(payload?.location_id || "").trim();
    const domain = String(payload?.domain || "").trim().toLowerCase();

    if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
    if (!DOMAIN_RE.test(domain)) return NextResponse.json({ error: "Enter a valid domain name." }, { status: 400 });

    const settings = await getDomainBenefitSettings();
    if (!settings.firstYearIncluded) {
      return publicResult(domain, false, "domain_benefit_disabled", "The included domain benefit is not currently available.");
    }

    const { data: location, error } = await supabaseAdmin
      .from("locations")
      .select("id,owner_user_id,owner_email,claimed_by_email,subscription_plan,subscription_status,included_domain_name,included_domain_claimed_at")
      .eq("id", locationId)
      .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
      .maybeSingle();

    if (error) {
      console.error("Partner Pro domain eligibility location lookup failed", error);
      return NextResponse.json({ error: "Unable to check domain eligibility right now." }, { status: 500 });
    }
    if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

    const isPartnerPro = String(location.subscription_plan || "").toLowerCase() === "business_pro";
    const isActive = ACTIVE_PARTNER_PRO_STATUSES.has(String(location.subscription_status || "").toLowerCase());
    if (!isPartnerPro || !isActive) {
      return publicResult(domain, false, "partner_pro_required", "An active Partner Pro membership is required for an included domain.");
    }

    if (location.included_domain_claimed_at && location.included_domain_name) {
      const claimedDomain = String(location.included_domain_name).toLowerCase();
      if (claimedDomain !== domain) {
        return publicResult(domain, false, "included_domain_already_claimed", "This location has already used its included domain benefit.", { claimedDomain });
      }
    }

    const availability = await searchDomain(domain);
    if (!availability.available) {
      return publicResult(domain, false, "domain_unavailable", "This domain is not available.", { available: false });
    }

    const registration = await quoteDomain(domain, "new", 1);
    const renewal = settings.renewalIncluded ? await quoteDomain(domain, "renewal", 1) : null;
    const premium = registration.isRegistryPremium || Boolean(renewal?.isRegistryPremium);
    const withinInternalCostPolicy =
      registration.wholesalePrice <= INTERNAL_INCLUDED_DOMAIN_MAX_WHOLESALE_USD &&
      (!renewal || renewal.wholesalePrice <= INTERNAL_INCLUDED_DOMAIN_MAX_WHOLESALE_USD);

    if (premium) {
      return publicResult(domain, false, "premium_domain", "Premium domains are not included with Partner Pro.", { available: true });
    }

    if (!withinInternalCostPolicy) {
      return publicResult(domain, false, "domain_not_included", "This domain is not eligible for the included Partner Pro domain benefit.", { available: true });
    }

    return publicResult(
      domain,
      true,
      "included_with_partner_pro",
      settings.renewalIncluded ? "First year and eligible renewals are included with Partner Pro." : "Your first year is included with Partner Pro. Renewal is not included.",
      {
        available: true,
        benefit: "one_included_domain_per_location",
        firstYearIncluded: true,
        renewalIncluded: settings.renewalIncluded,
      },
    );
  } catch (error) {
    console.error("Partner Pro domain eligibility failed", error);
    return NextResponse.json({ error: "Unable to check domain eligibility right now." }, { status: 502 });
  }
}
