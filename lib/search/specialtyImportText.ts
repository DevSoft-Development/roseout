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
