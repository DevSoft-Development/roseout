export type ReviewVerificationInput = {
  verified_visit?: boolean | null;
  is_verified_visit?: boolean | null;
  verification_source?: string | null;
  verified_at?: string | null;
};

export function reviewVerificationLabel(review: ReviewVerificationInput) {
  return review.verified_visit === true ? "Verified visit" : null;
}

export function reviewVerificationExplanation(review: ReviewVerificationInput) {
  return review.verified_visit === true
    ? "TheOutHaven verified a qualifying visit or booking. The review reflects the reviewer’s own opinion."
    : null;
}
