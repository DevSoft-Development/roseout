export type SponsoredPlacement = {
  sponsored?: boolean | null;
  isSponsored?: boolean | null;
  is_sponsored?: boolean | null;
  placement_type?: string | null;
  sponsor_label?: string | null;
  sponsor_id?: string | number | null;
  campaign_id?: string | number | null;
};

export function isSponsoredPlacement(value: SponsoredPlacement | null | undefined) {
  return Boolean(
    value?.sponsored === true ||
    value?.isSponsored === true ||
    value?.is_sponsored === true ||
    String(value?.placement_type || "").toLowerCase() === "sponsored",
  );
}

export function sponsoredLabel(value: SponsoredPlacement | null | undefined) {
  return isSponsoredPlacement(value) ? "Sponsored" : null;
}

export function sponsoredAttribution(value: SponsoredPlacement | null | undefined) {
  if (!isSponsoredPlacement(value)) return { sponsored: false, placementType: "organic", sponsorId: null, campaignId: null };
  return {
    sponsored: true,
    placementType: "sponsored",
    sponsorId: value?.sponsor_id != null ? String(value.sponsor_id) : null,
    campaignId: value?.campaign_id != null ? String(value.campaign_id) : null,
  };
}
