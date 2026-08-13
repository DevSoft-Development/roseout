import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDomainBenefitSettings } from "@/lib/domains/benefit-settings";
import {
  DomainGatewayError,
  type DomainRegistrantContact,
  quoteDomain,
  registerDomain,
  searchDomain,
} from "@/lib/domains/gateway";

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INTERNAL_INCLUDED_DOMAIN_MAX_WHOLESALE_USD = 20;

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

function reconciling(domain: string, operationId: string) {
  return NextResponse.json({
    ok: false,
    code: "registration_reconciling",
    status: "registering",
    domain,
    operation_id: operationId,
    error: "Your domain registration is being verified. Do not submit another domain.",
  }, { status: 202 });
}

function parseRegistrantContact(input: unknown): DomainRegistrantContact | null {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const contact: DomainRegistrantContact = {
    first_name: String(raw.first_name || "").trim(),
    last_name: String(raw.last_name || "").trim(),
    org_name: String(raw.org_name || "").trim() || undefined,
    address1: String(raw.address1 || "").trim(),
    address2: String(raw.address2 || "").trim() || undefined,
    city: String(raw.city || "").trim(),
    state: String(raw.state || "").trim() || undefined,
    postal_code: String(raw.postal_code || "").trim(),
    country: String(raw.country || "").trim().toUpperCase(),
    phone: String(raw.phone || "").trim(),
    email: String(raw.email || "").trim().toLowerCase(),
  };
  if (!contact.first_name || !contact.last_name || !contact.address1 || !contact.city || !contact.postal_code || !contact.phone) return null;
  if (!/^[A-Z]{2}$/.test(contact.country) || !EMAIL_RE.test(contact.email)) return null;
  if ((contact.country === "US" || contact.country === "CA") && !contact.state) return null;
  return contact;
}

async function markForReconciliation(operationId: string, errorCode: string) {
  const { error } = await supabaseAdmin
    .from("domain_registration_operations")
    .update({ status: "registering", error_code: errorCode, updated_at: new Date().toISOString() })
    .eq("id", operationId)
    .neq("status", "active");
  if (error) console.error("Unable to mark domain registration for reconciliation", error);
}

async function failReservation(operationId: string, errorCode: string) {
  const { error } = await supabaseAdmin.rpc("fail_partner_pro_included_domain", {
    p_operation_id: operationId,
    p_error_code: errorCode,
  });
  if (error) console.error("Unable to release failed domain reservation", error);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Please log in to continue.");

  const payload = await request.json().catch(() => ({}));
  const locationId = String(payload?.location_id || "").trim();
  const domain = String(payload?.domain || "").trim().toLowerCase();
  const contact = parseRegistrantContact(payload?.contact);

  if (!locationId) return fail(400, "missing_location", "Missing location.");
  if (!DOMAIN_RE.test(domain)) return fail(400, "invalid_domain", "Enter a valid domain name.");
  if (!contact) return fail(400, "invalid_registrant_contact", "Complete the domain owner contact information before continuing.");

  const settings = await getDomainBenefitSettings();
  if (!settings.firstYearIncluded) {
    return fail(403, "domain_benefit_disabled", "The included domain benefit is not currently available.");
  }

  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("id,owner_user_id,owner_email,claimed_by_email")
    .eq("id", locationId)
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .maybeSingle();

  if (locationError) {
    console.error("Domain provisioning location lookup failed", locationError);
    return fail(500, "location_lookup_failed", "Unable to prepare domain registration right now.");
  }
  if (!location) return fail(404, "location_not_found", "Location not found.");

  try {
    const availability = await searchDomain(domain);
    if (!availability.available) return fail(409, "domain_unavailable", "This domain is no longer available.");

    const registrationQuote = await quoteDomain(domain, "new", 1);
    const renewalQuote = settings.renewalIncluded ? await quoteDomain(domain, "renewal", 1) : null;

    if (registrationQuote.isRegistryPremium || Boolean(renewalQuote?.isRegistryPremium)) {
      return fail(409, "premium_domain", "Premium domains are not included with Partner Pro.");
    }
    if (
      registrationQuote.wholesalePrice > INTERNAL_INCLUDED_DOMAIN_MAX_WHOLESALE_USD ||
      (renewalQuote && renewalQuote.wholesalePrice > INTERNAL_INCLUDED_DOMAIN_MAX_WHOLESALE_USD)
    ) {
      return fail(409, "domain_not_included", "This domain is not eligible for the included Partner Pro domain benefit.");
    }
  } catch (error) {
    console.error("Domain provisioning eligibility recheck failed", error);
    return fail(502, "domain_check_failed", "Unable to confirm domain eligibility right now.");
  }

  const idempotencyKey = `toh-domain-${crypto
    .createHash("sha256")
    .update(`${locationId}:${domain}`)
    .digest("hex")
    .slice(0, 40)}`;

  const { data: operation, error: reserveError } = await supabaseAdmin.rpc("reserve_partner_pro_included_domain", {
    p_location_id: locationId,
    p_domain_name: domain,
    p_idempotency_key: idempotencyKey,
  });

  if (reserveError || !operation) {
    console.error("Domain claim reservation failed", reserveError);
    const reason = String(reserveError?.message || "");
    if (reason.includes("partner_pro_required")) return fail(403, "partner_pro_required", "An active Partner Pro membership is required.");
    if (reason.includes("included_domain_already_claimed")) return fail(409, "included_domain_already_claimed", "This location has already used its included domain benefit.");
    if (reason.includes("domain_claim_in_progress")) return fail(409, "domain_claim_in_progress", "Another domain claim is already in progress for this location.");
    if (reason.includes("idempotency_key_reused")) return fail(409, "idempotency_conflict", "Unable to continue this domain claim.");
    return fail(409, "claim_reservation_failed", "Unable to reserve this domain claim right now.");
  }

  if (operation.status === "active") {
    return NextResponse.json({
      ok: true,
      domain,
      status: "active",
      operation_id: operation.id,
      code: "domain_already_registered",
      message: "Your included domain is already registered.",
    });
  }

  if (operation.status === "registering") {
    return reconciling(domain, operation.id);
  }

  const { data: transitioned, error: registeringError } = await supabaseAdmin
    .from("domain_registration_operations")
    .update({ status: "registering", error_code: null, updated_at: new Date().toISOString() })
    .eq("id", operation.id)
    .eq("status", "reserved")
    .select("id")
    .maybeSingle();

  if (registeringError) {
    console.error("Unable to mark domain operation registering", registeringError);
    return fail(500, "registration_state_failed", "Unable to begin domain registration right now.");
  }

  if (!transitioned) {
    return reconciling(domain, operation.id);
  }

  let registration;
  try {
    registration = await registerDomain(domain, contact, idempotencyKey);
  } catch (error) {
    console.error("Domain gateway registration call failed", error);

    if (error instanceof DomainGatewayError) {
      if (error.registrationSucceeded) {
        await markForReconciliation(operation.id, "registration_result_persistence_unknown");
        return reconciling(domain, operation.id);
      }

      await failReservation(operation.id, error.code);
      if (error.code === "registration_disabled") return fail(503, "registration_not_enabled", "Domain registration is not available yet.");
      if (error.code === "domain_unavailable") return fail(409, "domain_unavailable", "This domain is no longer available.");
      if (error.code === "premium_domain" || error.code === "domain_not_included") {
        return fail(409, "domain_not_included", "This domain is not eligible for the included Partner Pro domain benefit.");
      }
      return fail(502, "registration_failed", "We could not register this domain right now. Please try again.");
    }

    await markForReconciliation(operation.id, "registration_transport_unknown");
    return reconciling(domain, operation.id);
  }

  const { data: completed, error: completeError } = await supabaseAdmin.rpc("complete_partner_pro_included_domain", {
    p_operation_id: operation.id,
    p_gateway_order_id: registration.orderId,
    p_gateway_response_code: registration.responseCode,
    p_gateway_expiration_date: registration.expirationDate || null,
  });

  if (completeError || !completed) {
    console.error("Domain registration completion persistence failed", completeError);
    await markForReconciliation(operation.id, "registration_completion_persistence_failed");
    return NextResponse.json({
      ok: false,
      code: "registration_reconciling",
      status: "registering",
      domain,
      operation_id: operation.id,
      error: "Your domain was submitted successfully and is being verified. Do not submit another domain.",
    }, { status: 202 });
  }

  return NextResponse.json({
    ok: true,
    domain,
    status: "active",
    operation_id: operation.id,
    code: "domain_registered",
    message: "Your included domain has been registered.",
  });
}
