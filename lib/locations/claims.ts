import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeClaimCode } from "@/lib/claimQr";
import { getIsClaimed } from "@/lib/locationClaim";
import type { ClaimSourceTable, ClaimTarget, PublicClaimLookup, SubmitLocationClaimInput } from "@/lib/locations/claimTypes";

const PUBLIC_SELECT = "id, name, location_name, restaurant_name, activity_name, location_type, primary_category, address, city, state, zip_code, source_table, source_id, is_claimed, claimed, claim_status, claimed_at, claimed_by_email, owner_user_id, claim_code, claim_token";
const SOURCE_SELECT = "id, name, restaurant_name, activity_name, primary_category, address, city, state, zip_code, is_claimed, claimed, claim_status, claimed_at, claimed_by_email, owner_user_id, claim_code, claim_token";

function clean(value: unknown) { return String(value ?? "").trim(); }
function displayName(row: Record<string, any>) { return clean(row.name || row.location_name || row.restaurant_name || row.activity_name) || "TheOutHaven Location"; }
function locationType(row: Record<string, any>, table?: string): ClaimTarget["locationType"] {
  if (table === "restaurants" || row.source_table === "restaurants" || row.location_type === "restaurant") return "restaurant";
  if (table === "activities" || row.source_table === "activities" || row.location_type === "activity") return "activity";
  if (table === "locations") return "location";
  return "unknown";
}

export function normalizeClaimTarget(raw: unknown): ClaimTarget | null {
  const row = raw as Record<string, any> | null;
  if (!row?.id) return null;
  const sourceTable = clean(row.source_table || row.__sourceTable || "locations") || "locations";
  return {
    locationId: String(row.location_id || row.id),
    sourceId: row.source_id ? String(row.source_id) : sourceTable !== "locations" ? String(row.id) : null,
    locationType: locationType(row, sourceTable),
    displayName: displayName(row),
    address: row.address ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    zipCode: row.zip_code ?? null,
    status: row.claim_status ?? null,
    isClaimed: getIsClaimed(row),
    sourceTable,
    claimCode: row.claim_code ?? null,
    claimToken: row.claim_token ?? null,
  };
}

async function lookup(table: ClaimSourceTable, column: "claim_token" | "claim_code", value: string) {
  const select = table === "locations" ? PUBLIC_SELECT : SOURCE_SELECT;
  const { data, error } = await (supabaseAdmin.from(table as any) as any).select(select).eq(column, value).maybeSingle();
  if (error) throw error;
  return data ? normalizeClaimTarget({ ...data, __sourceTable: table }) : null;
}

export async function lookupClaimToken(token: string): Promise<PublicClaimLookup | null> {
  const value = clean(token);
  if (!value) return null;
  const target = (await lookup("locations", "claim_token", value)) || (await lookup("restaurants", "claim_token", value)) || (await lookup("activities", "claim_token", value));
  return target ? { target, claimAccess: { mode: "token", value } } : null;
}

export async function lookupClaimCode(code: string): Promise<PublicClaimLookup | null> {
  const value = normalizeClaimCode(code);
  if (!value) return null;
  const target = (await lookup("locations", "claim_code", value)) || (await lookup("restaurants", "claim_code", value)) || (await lookup("activities", "claim_code", value));
  return target ? { target, claimAccess: { mode: "code", value } } : null;
}

async function findCanonicalLocation(target: ClaimTarget) {
  if (target.sourceTable === "locations") return { id: target.locationId, source_table: target.sourceTable, source_id: target.sourceId };
  const { data } = await supabaseAdmin.from("locations").select("id, source_table, source_id").eq("source_table", target.sourceTable).eq("source_id", String(target.sourceId || target.locationId)).maybeSingle();
  return data || { id: null, source_table: target.sourceTable, source_id: target.sourceId || target.locationId };
}

export async function submitLocationClaim(input: SubmitLocationClaimInput) {
  const ownerName = clean(input.owner_name);
  const ownerEmail = clean(input.owner_email).toLowerCase();
  if (!ownerName || !ownerEmail) throw Object.assign(new Error("Name and email are required."), { status: 400 });
  const lookupResult = input.token ? await lookupClaimToken(input.token) : await lookupClaimCode(input.code || "");
  if (!lookupResult) throw Object.assign(new Error("Invalid claim link or code."), { status: 404 });
  const { target } = lookupResult;
  if (target.isClaimed) throw Object.assign(new Error("This location has already been claimed."), { status: 400 });
  const canonical = await findCanonicalLocation(target);
  const now = new Date().toISOString();
  const payload = {
    user_id: input.user_id || null,
    location_id: canonical.id,
    location_name: target.displayName,
    location_type: target.locationType === "unknown" ? "location" : target.locationType,
    request_type: "Claim existing listing",
    address: target.address || null,
    city: target.city || null,
    state: target.state || null,
    zip_code: target.zipCode || null,
    owner_name: ownerName,
    owner_email: ownerEmail,
    owner_phone: clean(input.owner_phone) || null,
    notes: clean(input.message) || null,
    status: "pending",
    verification_status: lookupResult.claimAccess.mode === "code" ? "code_verified" : "token_verified",
    claim_code: target.claimCode || null,
    match_status: canonical.id ? "exact_match" : "pending_review",
    matched_location_snapshot: target as any,
    submission_payload: { source_table: target.sourceTable, source_id: target.sourceId, claim_access_mode: lookupResult.claimAccess.mode },
    submitted_at: now,
    updated_at: now,
  };
  const { data: existing } = await supabaseAdmin.from("location_claim_requests").select("id, status").eq("owner_email", ownerEmail).eq("location_id", canonical.id).in("status", ["pending", "approved"]).maybeSingle();
  if (existing) return { success: true, duplicate: true, claimId: existing.id, status: existing.status, target };
  const { data, error } = await supabaseAdmin.from("location_claim_requests").insert(payload).select("id, status").single();
  if (error) throw error;
  const update = { claim_status: "pending", claimed_by_email: ownerEmail, updated_at: now };
  if (canonical.id) await supabaseAdmin.from("locations").update(update).eq("id", canonical.id);
  if (target.sourceTable === "restaurants" || target.sourceTable === "activities") await (supabaseAdmin.from(target.sourceTable as any) as any).update(update).eq("id", target.sourceId || target.locationId);
  return { success: true, duplicate: false, claimId: data.id, status: data.status, target };
}

export async function linkOwnerToLocation(userId: string, locationId: string, role: "owner" | "admin" | "viewer" = "owner") {
  const { data: location } = await supabaseAdmin.from("locations").select("id, source_id").eq("id", locationId).maybeSingle();
  const { error } = await supabaseAdmin.from("location_owner_locations").upsert({ user_id: userId, location_id: locationId, source_location_id: location?.source_id || null, role, status: "active", updated_at: new Date().toISOString() }, { onConflict: "user_id,location_id" });
  if (error) throw error;
}

export async function approveLocationClaim(claimId: string, actorContext?: { userId?: string | null }) {
  const { data: claim, error } = await supabaseAdmin.from("location_claim_requests").select("*").eq("id", claimId).maybeSingle();
  if (error || !claim) throw Object.assign(new Error("Location claim request not found."), { status: 404 });
  const now = new Date().toISOString();
  await supabaseAdmin.from("location_claim_requests").update({ status: "approved", reviewed_at: now, reviewed_by: actorContext?.userId || null, claimed_at: now, updated_at: now }).eq("id", claimId).throwOnError();
  if (claim.location_id) {
    const ownerUpdate = { claim_status: "approved", is_claimed: true, claimed: true, claimed_at: now, claimed_by: claim.user_id || null, claimed_by_email: claim.owner_email, owner_user_id: claim.user_id || null, owner_email: claim.owner_email, owner_name: claim.owner_name, owner_phone: claim.owner_phone, updated_at: now };
    await supabaseAdmin.from("locations").update(ownerUpdate).eq("id", claim.location_id).throwOnError();
    const { data: loc } = await supabaseAdmin.from("locations").select("source_table, source_id").eq("id", claim.location_id).maybeSingle();
    if (loc?.source_table && ["restaurants", "activities"].includes(loc.source_table) && loc.source_id) await (supabaseAdmin.from(loc.source_table as any) as any).update(ownerUpdate).eq("id", loc.source_id);
    if (claim.user_id) {
      await supabaseAdmin.from("business_claims").upsert({ user_id: claim.user_id, location_id: claim.location_id, source_table: loc?.source_table || null, source_location_id: loc?.source_id || null, claim_code: claim.claim_code || `NO-CODE-${String(claim.id).slice(0, 8)}`, status: "approved", verification_status: claim.verification_status || "admin_approved", owner_email: claim.owner_email, owner_phone: claim.owner_phone || null, role_at_business: claim.role_at_business || null, note: claim.notes || null, claimed_at: now, reviewed_at: now, reviewed_by: actorContext?.userId || null, updated_at: now }, { onConflict: "user_id,location_id" });
      await linkOwnerToLocation(claim.user_id, claim.location_id, "owner");
    }
  }
  return { success: true, claim };
}

export async function rejectLocationClaim(claimId: string, actorContext?: { userId?: string | null }) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("location_claim_requests").update({ status: "rejected", reviewed_at: now, reviewed_by: actorContext?.userId || null, updated_at: now }).eq("id", claimId);
  if (error) throw error;
  return { success: true };
}
