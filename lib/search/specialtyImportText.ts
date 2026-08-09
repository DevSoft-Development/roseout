const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function containsStandaloneImportTerm(input: string, term: string) {
  const normalizedInput = String(input || "").toLowerCase();
  const normalizedTerm = String(term || "").trim().toLowerCase();
  if (!normalizedTerm) return false;

  return new RegExp(
    `(^|[^a-z0-9])${escapeRegex(normalizedTerm)}(?=$|[^a-z0-9])`,
    "i",
  ).test(normalizedInput);
}

const PERFUME_OUTING_EVIDENCE =
  /\b(perfume|perfumery|fragrance|fragrances|scent|scents)\b.{0,60}\b(making|make|workshop|workshops|class|classes|experience|experiences|blending|blend|lesson|lessons|session|sessions|create your own)\b|\b(making|make|workshop|workshops|class|classes|experience|experiences|blending|blend|lesson|lessons|session|sessions|create your own)\b.{0,60}\b(perfume|perfumery|fragrance|fragrances|scent|scents)\b/i;

export function hasPerfumeMakingEvidence(input: string) {
  return PERFUME_OUTING_EVIDENCE.test(String(input || ""));
}
