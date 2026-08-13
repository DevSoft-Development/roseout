import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Please log in to continue.");

  const payload = await request.json().catch(() => ({}));
  const locationId = String(payload?.location_id || "").trim();
  const domain = String(payload?.domain || "").trim().toLowerCase();

  if (!locationId) return fail(400, "missing_location", "Missing location.");
  if (!DOMAIN_RE.test(domain)) return fail(400, "invalid_domain", "Enter a valid domain name.");

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

  return NextResponse.json({
    ok: true,
    domain,
    status: operation.status,
    operation_id: operation.id,
    code: "domain_claim_reserved",
    message: "Your domain claim is reserved. Registration will begin once domain provisioning is enabled.",
  });
}
