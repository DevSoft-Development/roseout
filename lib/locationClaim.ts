export type LocationClaimFields = {
  is_claimed?: boolean | null;
  claim_status?: string | null;
  claimed_at?: string | null;
  claimed_by_email?: string | null;
  owner_user_id?: string | null;
};

export function getIsClaimed(location: any) {
  return Boolean(location?.is_claimed);
}

export function getClaimStatusText(location: LocationClaimFields) {
  return location.claim_status || (getIsClaimed(location) ? "claimed" : "unclaimed");
}
