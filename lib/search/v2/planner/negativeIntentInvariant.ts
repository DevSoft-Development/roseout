import { canonicalTaxonomy } from "../taxonomy";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function aliasesForExcludedIds(excludedIds: readonly string[]) {
  const excluded = new Set(excludedIds.map((value) => String(value).trim()).filter(Boolean));
  if (!excluded.size) return [];

  const aliases = new Set<string>();
  for (const entry of canonicalTaxonomy) {
    if (!excluded.has(entry.id)) continue;
    aliases.add(entry.id.replace(/[_-]+/g, " "));
    for (const alias of entry.aliases) aliases.add(String(alias).trim().toLowerCase());
  }

  return [...aliases].filter(Boolean).sort((left, right) => right.length - left.length);
}

/**
 * Final parser safeguard: an explicit taxonomy exclusion must never survive
 * as a positive term in the effective query sent to the deterministic core.
 * This is intentionally independent of sentence punctuation/list grammar so
 * exclusions remain authoritative for comma lists, Oxford commas, and mixed
 * conjunctions.
 */
export function removeExcludedTaxonomyTerms(query: string, excludedIds: readonly string[]) {
  let rewritten = query;
  for (const alias of aliasesForExcludedIds(excludedIds)) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(alias)}(?=$|[^a-z0-9])`, "gi");
    rewritten = rewritten.replace(pattern, (_match, prefix: string) => prefix || " ");
  }

  return rewritten
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/,\s*,+/g, ",")
    .trim();
}
