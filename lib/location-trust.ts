export type LocationTrustInput = {
  is_claimed?: boolean | null;
  claimed?: boolean | null;
  claim_status?: string | null;
  is_verified?: boolean | null;
  claim_verification_status?: string | null;
  last_quality_check_at?: string | null;
  updated_at?: string | null;
};

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function locationTrustSignals(location: LocationTrustInput, now = new Date()) {
  const claimStatus = normalized(location.claim_status);
  const verificationStatus = normalized(location.claim_verification_status);
  const claimed = Boolean(
    location.is_claimed === true ||
    location.claimed === true ||
    ["approved", "claimed", "verified", "active"].includes(claimStatus),
  );
  const verified = Boolean(
    location.is_verified === true ||
    verificationStatus === "verified",
  );
  const freshnessSource = location.last_quality_check_at || location.updated_at || null;
  const checkedAt = freshnessSource ? new Date(freshnessSource) : null;
  const checkedAtValid = Boolean(checkedAt && Number.isFinite(checkedAt.getTime()));
  const ageDays = checkedAtValid && checkedAt
    ? Math.max(0, (now.getTime() - checkedAt.getTime()) / 86_400_000)
    : null;
  return {
    claimed,
    verified,
    checkedAt: checkedAtValid ? checkedAt : null,
    recentlyChecked: ageDays !== null && ageDays <= 30,
  };
}

export function locationFreshnessLabel(location: LocationTrustInput, now = new Date()) {
  const trust = locationTrustSignals(location, now);
  if (!trust.checkedAt) return null;
  if (trust.recentlyChecked) return "Recently checked";
  return `Checked ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(trust.checkedAt)}`;
}
