export type ClaimLocationType = "restaurant" | "activity" | "location" | "unknown";
export type ClaimSourceTable = "restaurants" | "activities" | "locations";

export type ClaimTarget = {
  locationId: string;
  sourceId?: string | null;
  locationType: ClaimLocationType;
  displayName: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  status?: string | null;
  isClaimed?: boolean | null;
  sourceTable?: string;
  claimCode?: string | null;
  claimToken?: string | null;
};

export type PublicClaimLookup = {
  target: ClaimTarget;
  claimAccess: { mode: "token" | "code"; value: string };
};

export type SubmitLocationClaimInput = {
  token?: string | null;
  code?: string | null;
  owner_name: string;
  owner_email: string;
  owner_phone?: string | null;
  message?: string | null;
  user_id?: string | null;
};
