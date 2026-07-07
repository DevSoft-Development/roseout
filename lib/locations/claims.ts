import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  sendAdminNewClaimEmail,
  sendClaimCodeSubmittedEmail,
} from "@/lib/notifications";
import { getIsClaimed } from "@/lib/locationClaim";
import type {
  ClaimLookupResult,
  ClaimTarget,
  ClaimTargetType,
  SubmitLocationClaimInput,
  SubmitLocationClaimResult,
} from "@/lib/locations/claimTypes";
import {
  ensureOwnerAccessForApprovedClaim,
  linkOwnerToLocation,
} from "@/lib/locations/ownerAccess";

const LOCATION_SELECT =
  "id, name, location_name, restaurant_name, activity_name, source_table, source_id, address, city, state, zip_code, phone, website, claim_status, is_claimed, claimed, claimed_at, claimed_by_email, owner_user_id, claim_code, claim_token";
const RESTAURANT_SELECT =
  "id, name, restaurant_name, primary_category, cuisine, cuisine_type, food_type, primary_tag, tags, google_types, address, city, state, zip_code, phone, website, is_claimed, claimed, claim_status, claimed_at, claimed_by_email, owner_user_id, claim_code, claim_token";
const ACTIVITY_SELECT =
  "id, name, activity_name, primary_category, activity_type, primary_tag, tags, google_types, address, city, state, zip_code, phone, website, is_claimed, claimed, claim_status, claimed_at, claimed_by_email, owner_user_id, claim_code, claim_token";

function clean(value: unknown) {
  return String(value || "").trim();
}

function displayName(row: any) {
  return (
    clean(
      row?.name ||
        row?.location_name ||
        row?.restaurant_name ||
        row?.activity_name,
    ) || "TheOutHaven Location"
  );
}

function toType(row: any, fallback: ClaimTargetType): ClaimTargetType {
  const raw = clean(
    row?.location_type || row?.source_table || row?.type,
  ).toLowerCase();
  if (raw.includes("restaurant")) return "restaurant";
  if (raw.includes("activit")) return "activity";
  return fallback;
}

export function normalizeClaimTarget(
  raw: any,
  fallback: ClaimTargetType = "unknown",
  sourceTable?: string,
): ClaimTarget | null {
  if (!raw?.id) return null;
  return {
    locationId: String(raw.location_id || raw.id),
    locationType: toType(raw, fallback),
    displayName: displayName(raw),
    address: raw.address || null,
    city: raw.city || null,
    state: raw.state || null,
    zipCode: raw.zip_code || raw.zipCode || null,
    phone: raw.phone || null,
    website: raw.website || null,
    status: raw.claim_status || null,
    sourceTable:
      sourceTable ||
      raw.source_table ||
      (fallback === "restaurant"
        ? "restaurants"
        : fallback === "activity"
          ? "activities"
          : "locations"),
    sourceLocationId: raw.source_id
      ? String(raw.source_id)
      : sourceTable && sourceTable !== "locations"
        ? String(raw.id)
        : null,
    claimCode: raw.claim_code || null,
    alreadyClaimed: getIsClaimed(raw),
  };
}

async function findCanonicalForSource(sourceTable: string, sourceId: string) {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(LOCATION_SELECT)
    .eq("source_table", sourceTable)
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function lookupSourceTableClaim(
  table: "restaurants" | "activities",
  value: string,
) {
  const fallbackType: ClaimTargetType = table === "restaurants" ? "restaurant" : "activity";
  const select = table === "restaurants" ? RESTAURANT_SELECT : ACTIVITY_SELECT;

  const tokenQuery = await supabaseAdmin
    .from(table)
    .select(select)
    .eq("claim_token", value)
    .maybeSingle();
  if (tokenQuery.error) throw tokenQuery.error;

  const codeQuery = tokenQuery.data
    ? { data: null, error: null }
    : await supabaseAdmin
        .from(table)
        .select(select)
        .eq("claim_code", value)
        .maybeSingle();
  if (codeQuery.error) throw codeQuery.error;

  const source = tokenQuery.data || codeQuery.data;
  if (!source) return null;

  const canonical = await findCanonicalForSource(table, String(source.id));
  if (!canonical?.id) {
    return {
      ok: false as const,
      error:
        "This claim code is valid, but it is not connected to a production location yet. Please request manual verification.",
      status: 409,
      reason: "invalid" as const,
    };
  }

  const target = normalizeClaimTarget(canonical, fallbackType, "locations");
  if (!target) return null;
  target.locationType = fallbackType;
  target.sourceTable = table;
  target.sourceLocationId = String(source.id);
  target.claimCode = source.claim_code || canonical.claim_code || value;
  return { ok: true as const, target };
}

export async function lookupClaimToken(
  token: string,
): Promise<ClaimLookupResult> {
  const value = clean(token);
  if (!value)
    return {
      ok: false,
      error: "Missing token",
      status: 400,
      reason: "invalid",
    };

  const locationQueries = [
    supabaseAdmin
      .from("locations")
      .select(LOCATION_SELECT)
      .eq("claim_token", value)
      .maybeSingle(),
    supabaseAdmin
      .from("locations")
      .select(LOCATION_SELECT)
      .eq("claim_code", value)
      .maybeSingle(),
  ];

  for (const query of locationQueries) {
    const { data, error } = await query;
    if (error) throw error;
    const target = normalizeClaimTarget(data, "location", "locations");
    if (target) return { ok: true, target };
  }

  const restaurantLookup = await lookupSourceTableClaim("restaurants", value);
  if (restaurantLookup) return restaurantLookup;

  const activityLookup = await lookupSourceTableClaim("activities", value);
  if (activityLookup) return activityLookup;

  return {
    ok: false,
    error: "Location claim link not found.",
    status: 404,
    reason: "not_found",
  };
}

function publicTargetPayload(target: ClaimTarget) {
  const row = {
    id: target.locationId,
    name: target.displayName,
    location_name: target.displayName,
    restaurant_name:
      target.locationType === "restaurant" ? target.displayName : undefined,
    activity_name:
      target.locationType === "activity" ? target.displayName : undefined,
    address: target.address,
    city: target.city,
    state: target.state,
    zip_code: target.zipCode,
    zipCode: target.zipCode,
    phone: target.phone,
    website: target.website,
    claim_status: target.status,
    claimStatus: target.status,
    locationType: target.locationType,
    is_claimed: target.alreadyClaimed,
    claimed: target.alreadyClaimed,
    source_table: target.sourceTable,
    source_id: target.sourceLocationId,
  };
  return row;
}

export function claimLookupResponsePayload(target: ClaimTarget) {
  const location = publicTargetPayload(target);
  return { target, location, restaurant: location, activity: location };
}

export async function submitLocationClaim(
  input: SubmitLocationClaimInput,
): Promise<SubmitLocationClaimResult> {
  const contactName = clean(input.contactName);
  const email = clean(input.email).toLowerCase();
  if (!clean(input.token))
    return { ok: false, error: "Missing token", status: 400 };
  if (!contactName || !email)
    return { ok: false, error: "Name and email are required.", status: 400 };
  if (!input.userId)
    return {
      ok: false,
      error: "Sign in or create a business account before submitting this claim.",
      status: 401,
    };

  const lookup = await lookupClaimToken(input.token);
  if (!lookup.ok)
    return {
      ok: false,
      error: "Invalid claim link.",
      status: lookup.status || 404,
    };
  if (lookup.target.alreadyClaimed)
    return {
      ok: false,
      error: "This location has already been claimed.",
      status: 400,
    };

  const target = lookup.target;
  const now = new Date().toISOString();
  const { data: duplicate } = await supabaseAdmin
    .from("location_claim_requests")
    .select("id,status")
    .eq("location_id", target.locationId)
    .eq("owner_email", email)
    .in("status", ["pending", "needs_more_info", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (duplicate?.id)
    return {
      ok: true,
      claimId: duplicate.id,
      target,
      status: duplicate.status || "pending",
    };

  const { data: claim, error } = await supabaseAdmin
    .from("location_claim_requests")
    .insert({
      user_id: input.userId,
      location_id: target.locationId,
      location_name: input.businessName || target.displayName,
      location_type: target.locationType,
      request_type: "Claim existing listing",
      address: target.address || null,
      city: target.city || null,
      state: target.state || null,
      zip_code: target.zipCode || null,
      owner_name: contactName,
      owner_email: email,
      owner_phone: input.phone || null,
      notes: input.notes || null,
      status: "pending",
      verification_status:
        input.source === "qr" ? "qr_token_verified" : "token_verified",
      match_status: "exact_match",
      role_at_business: input.role || null,
      claim_code: target.claimCode || input.token,
      matched_location_snapshot: target as any,
      submission_payload: {
        source: input.source || "claim",
        tokenType: "claim_token",
      },
      submitted_at: now,
      created_at: now,
      updated_at: now,
    })
    .select("id,status")
    .single();
  if (error) return { ok: false, error: error.message, status: 500 };

  await supabaseAdmin
    .from("locations")
    .update({
      claim_status: "pending",
      claimed_by_email: email,
      claim_submitted_at: now,
    })
    .eq("id", target.locationId);
  if (target.sourceTable === "restaurants" && target.sourceLocationId)
    await supabaseAdmin
      .from("restaurants")
      .update({ claim_status: "pending", claimed_by_email: email })
      .eq("id", target.sourceLocationId);
  if (target.sourceTable === "activities" && target.sourceLocationId)
    await supabaseAdmin
      .from("activities")
      .update({ claim_status: "pending", claimed_by_email: email })
      .eq("id", target.sourceLocationId);

  await Promise.allSettled([
    sendClaimCodeSubmittedEmail({
      email,
      contactNameOrOwnerName: contactName,
      locationName: input.businessName || target.displayName,
      claimCode: target.claimCode || input.token,
      claimRequestId: claim.id,
    }),
    sendAdminNewClaimEmail({
      locationName: input.businessName || target.displayName,
      requestType: "Claim existing listing",
      contactNameOrOwnerName: contactName,
      businessEmail: email,
      phone: input.phone || null,
      matchStatus: "exact_match",
      verificationStatus:
        input.source === "qr" ? "qr_token_verified" : "token_verified",
      planInterest: "free_discovery",
      claimCode: target.claimCode || input.token,
      claimRequestId: claim.id,
      locationId: target.locationId,
      address: target.address || null,
      city: target.city || null,
      state: target.state || null,
      zipCode: target.zipCode || null,
    }),
  ]);

  return {
    ok: true,
    claimId: claim.id,
    target,
    status: claim.status || "pending",
  };
}

export async function approveLocationClaim({
  claimId,
  actorContext,
}: {
  claimId: string;
  actorContext?: { userId?: string | null };
}) {
  const now = new Date().toISOString();
  const { data: claim, error } = await supabaseAdmin
    .from("location_claim_requests")
    .select("*")
    .eq("id", claimId)
    .maybeSingle();
  if (error || !claim)
    return {
      ok: false as const,
      error: "Location claim request not found.",
      status: 404,
    };

  if (!claim.user_id || !claim.location_id) {
    return {
      ok: false as const,
      error:
        "This claim cannot be approved yet because it is missing a signed-in owner account or a matched location. Attach an owner user and location before approval.",
      status: 409,
    };
  }

  const currentStatus = String(claim.status || "").toLowerCase();
  if (!["pending", "needs_more_info"].includes(currentStatus)) {
    return {
      ok: false as const,
      error: `Only pending claims can be approved. Current status: ${currentStatus || "unknown"}.`,
      status: 409,
    };
  }

  const approvedClaim = {
    ...claim,
    status: "approved",
    reviewed_by: actorContext?.userId || null,
  };
  const grant = await ensureOwnerAccessForApprovedClaim(approvedClaim);
  if (!grant.ok) {
    return { ok: false as const, error: grant.error, status: 400 };
  }

  const { error: updateError } = await supabaseAdmin
    .from("location_claim_requests")
    .update({
      status: "approved",
      reviewed_at: now,
      reviewed_by: actorContext?.userId || null,
      claimed_at: now,
      updated_at: now,
    })
    .eq("id", claimId);
  if (updateError)
    return { ok: false as const, error: updateError.message, status: 500 };

  return { ok: true as const, claim: approvedClaim };
}

export async function rejectLocationClaim({
  claimId,
  actorContext,
  reason,
  status = "rejected",
}: {
  claimId: string;
  actorContext?: { userId?: string | null };
  reason?: string | null;
  status?: "rejected" | "needs_more_info";
}) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("location_claim_requests")
    .update({
      status,
      reviewed_at: now,
      reviewed_by: actorContext?.userId || null,
      notes: reason || undefined,
      updated_at: now,
    })
    .eq("id", claimId);
  return error
    ? { ok: false as const, error: error.message, status: 500 }
    : { ok: true as const };
}

export async function linkLegacyApprovedClaimToOwnerAccess({
  type,
  claimId,
  userId,
  reviewedBy,
}: {
  type: "restaurant" | "activity";
  claimId: string;
  userId: string;
  reviewedBy?: string | null;
}) {
  const table = type === "restaurant" ? "restaurant_claims" : "activity_claims";
  const idField = type === "restaurant" ? "restaurant_id" : "activity_id";
  const { data: claim, error } = await supabaseAdmin
    .from(table)
    .select("*")
    .eq("id", claimId)
    .maybeSingle();
  if (error || !claim)
    return { ok: false as const, error: "Legacy claim not found." };
  const sourceTable = type === "restaurant" ? "restaurants" : "activities";
  const sourceId = String(claim[idField]);
  const canonical = await findCanonicalForSource(sourceTable, sourceId);
  if (!canonical?.id)
    return {
      ok: false as const,
      error: "Canonical location not found for legacy claim.",
    };
  await linkOwnerToLocation({
    userId,
    locationId: String(canonical.id),
    sourceClaimId: claimId,
    sourceClaimTable: table,
    ownerEmail: claim.owner_email,
    ownerPhone: claim.owner_phone,
    roleAtBusiness: "owner",
    reviewedBy,
  });
  return { ok: true as const };
}

export async function createClaimForLocation(locationId: string) {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(LOCATION_SELECT)
    .eq("id", locationId)
    .maybeSingle();
  if (error || !data)
    return { ok: false as const, error: "Location not found." };
  return {
    ok: true as const,
    target: normalizeClaimTarget(data, "location", "locations"),
  };
}
