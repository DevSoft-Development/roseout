import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureOrganizationForLocationOwner } from "@/lib/organizations/bootstrap";

export type LinkOwnerToLocationInput = {
  userId: string;
  locationId: string;
  role?: "owner" | "admin" | "viewer";
  sourceClaimId?: string | null;
  sourceClaimTable?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  roleAtBusiness?: string | null;
  claimCode?: string | null;
  verificationStatus?: string | null;
  reviewedBy?: string | null;
};

export async function getCanonicalLocationForOwnerAccess(locationId: string) {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id, source_table, source_id")
    .eq("id", locationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; source_table?: string | null; source_id?: string | null } | null;
}

export async function linkOwnerToLocation(input: LinkOwnerToLocationInput) {
  const role = input.role || "owner";
  const now = new Date().toISOString();
  const location = await getCanonicalLocationForOwnerAccess(input.locationId);
  if (!location) throw new Error("Location not found for owner access grant.");
  const sourceId = location.source_id ? String(location.source_id) : null;

  const { error: ownerMapError } = await supabaseAdmin.from("location_owner_locations").upsert(
    {
      user_id: input.userId,
      location_id: input.locationId,
      source_location_id: sourceId,
      status: "active",
      role,
      updated_at: now,
    },
    { onConflict: "user_id,location_id" },
  );
  if (ownerMapError) throw new Error(ownerMapError.message);

  const { error: claimError } = await supabaseAdmin.from("business_claims").upsert(
    {
      user_id: input.userId,
      location_id: input.locationId,
      source_table: location.source_table || null,
      source_location_id: sourceId,
      claim_code: input.claimCode || input.sourceClaimId || `ADMIN-${input.locationId.slice(0, 8)}`,
      status: "approved",
      verification_status: input.verificationStatus || "admin_approved",
      owner_email: input.ownerEmail || "unknown@theouthaven.com",
      owner_phone: input.ownerPhone || null,
      role_at_business: input.roleAtBusiness || role,
      note: input.sourceClaimTable ? `Approved from ${input.sourceClaimTable}` : null,
      claimed_at: now,
      reviewed_at: now,
      reviewed_by: input.reviewedBy || null,
      updated_at: now,
    },
    { onConflict: "user_id,location_id" },
  );
  if (claimError) throw new Error(claimError.message);

  const ownerUpdate = {
    claim_status: "approved",
    claim_verification_status: input.verificationStatus || "admin_approved",
    is_claimed: true,
    claimed: true,
    claimed_at: now,
    claimed_by: input.userId,
    owner_user_id: input.userId,
    owner_email: input.ownerEmail || null,
    owner_phone: input.ownerPhone || null,
  };

  const { error: locationUpdateError } = await supabaseAdmin
    .from("locations")
    .update(ownerUpdate)
    .eq("id", input.locationId);
  if (locationUpdateError) throw new Error(locationUpdateError.message);

  if (location.source_table && sourceId && ["restaurants", "activities"].includes(location.source_table)) {
    await supabaseAdmin
      .from(location.source_table as "restaurants" | "activities")
      .update(ownerUpdate)
      .eq("id", sourceId);
  }

  const organization =
    role === "owner" || role === "admin"
      ? await ensureOrganizationForLocationOwner({
          userId: input.userId,
          locationId: input.locationId,
          sourceType: input.sourceClaimTable || "location_owner_locations",
          sourceId: input.sourceClaimId || input.locationId,
          actorUserId: input.reviewedBy || input.userId,
        })
      : null;

  return {
    ok: true as const,
    locationId: input.locationId,
    userId: input.userId,
    organizationId: organization?.organizationId || null,
  };
}

export async function ensureOwnerAccessForApprovedClaim(claim: Record<string, any>) {
  if (String(claim.status || "").toLowerCase() !== "approved") {
    return { ok: false as const, error: "Claim is not approved." };
  }
  if (!claim.user_id || !claim.location_id) {
    return { ok: false as const, error: "Approved claim is missing user or location." };
  }
  return linkOwnerToLocation({
    userId: String(claim.user_id),
    locationId: String(claim.location_id),
    role: "owner",
    sourceClaimId: String(claim.id || ""),
    sourceClaimTable: "location_claim_requests",
    ownerEmail: claim.owner_email || null,
    ownerPhone: claim.owner_phone || null,
    roleAtBusiness: claim.role_at_business || null,
    claimCode: claim.claim_code || null,
    verificationStatus: claim.verification_status || null,
    reviewedBy: claim.reviewed_by || null,
  });
}
