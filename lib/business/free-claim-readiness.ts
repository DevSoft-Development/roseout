/** Claim approval is not a paid subscription and must never require one. */
export type ClaimReadinessInput = Readonly<{
  ownerVerified: boolean;
  profileComplete: boolean;
  paidSubscriptionActive: boolean;
}>;

export function getClaimReadiness(input: ClaimReadinessInput) {
  return {
    canManageFreeListing: input.ownerVerified,
    freeListingReady: input.ownerVerified && input.profileComplete,
    paidFeaturesActive: input.ownerVerified && input.paidSubscriptionActive,
    nextStep: !input.ownerVerified ? "verify_owner" : !input.profileComplete ? "complete_profile" : "manage_listing",
  } as const;
}
