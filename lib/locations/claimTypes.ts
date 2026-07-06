export type ClaimTargetType = "restaurant" | "activity" | "location" | "unknown";

export type ClaimTarget = {
  locationId: string;
  locationType: ClaimTargetType;
  displayName: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  website?: string | null;
  status?: string | null;
  sourceTable?: "restaurants" | "activities" | "locations" | string;
  sourceLocationId?: string | null;
  claimCode?: string | null;
  alreadyClaimed?: boolean;
};

export type ClaimLookupResult =
  | { ok: true; target: ClaimTarget }
  | {
      ok: false;
      error: string;
      status?: number;
      reason?: "not_found" | "expired" | "already_claimed" | "invalid";
    };

export type SubmitLocationClaimInput = {
  token: string;
  businessName?: string;
  contactName: string;
  email: string;
  phone?: string;
  role?: string;
  notes?: string;
  source?: "claim" | "claim-activity" | "admin" | "qr" | string;
  userId?: string | null;
};

export type SubmitLocationClaimResult =
  | { ok: true; claimId: string; target: ClaimTarget; status: string }
  | { ok: false; error: string; status?: number };

export type ClaimApprovalActorContext = {
  userId?: string | null;
  role?: string | null;
};
