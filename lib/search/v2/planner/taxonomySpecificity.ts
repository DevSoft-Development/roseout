import { canonicalTaxonomy, type CanonicalTaxonomyEntry } from "../taxonomy";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Span = {
  entry: CanonicalTaxonomyEntry;
  alias: string;
  start: number;
  end: number;
};

function spansFor(query: string) {
  const normalized = query.toLowerCase();
  const spans: Span[] = [];
  for (const entry of canonicalTaxonomy) {
    for (const rawAlias of entry.aliases) {
      const alias = rawAlias.trim().toLowerCase();
      if (!alias) continue;
      const regex = new RegExp(`(^|[^a-z0-9])(${escapeRegex(alias)})(?=$|[^a-z0-9])`, "gi");
      for (const match of normalized.matchAll(regex)) {
        if (match.index == null) continue;
        const prefixLength = match[1]?.length ?? 0;
        const start = match.index + prefixLength;
        spans.push({ entry, alias, start, end: start + alias.length });
      }
    }
  }
  return spans;
}

function containsTerm(text: string, term: string) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(term)}(?=$|[^a-z0-9])`, "i").test(text);
}

function disambiguatingAlias(span: Span, contained: Span[]) {
  const conflicts = contained.filter((item) => item.entry.domain === span.entry.domain && item.entry.id !== span.entry.id);
  if (!conflicts.length) return null;
  const aliases = [...span.entry.aliases].sort((left, right) => left.length - right.length);
  return aliases.find((alias) => conflicts.every((conflict) => !containsTerm(alias.toLowerCase(), conflict.alias))) ?? null;
}

/**
 * Rewrites only genuinely ambiguous same-domain phrase overlaps before the
 * deterministic parser runs. This keeps the parser broad while preventing a
 * specific phrase from accidentally becoming multiple hard constraints.
 *
 * Examples:
 * - "mini golf" -> a mini-golf-only alias, so it does not also become golf.
 * - "chicken wings" -> a wings-only alias, so it does not also require chicken.
 * Cross-domain meaning is preserved: "rooftop lounge" can still mean both a
 * rooftop feature and a lounge/nightlife request.
 */
export function rewriteSpecificTaxonomyPhrases(query: string) {
  const spans = spansFor(query);
  if (!spans.length) return query;
  const ranked = [...spans].sort((left, right) => (right.end - right.start) - (left.end - left.start) || left.start - right.start);
  const accepted: Span[] = [];

  for (const span of ranked) {
    const containedBySpecificSameDomain = accepted.some((other) =>
      other.entry.domain === span.entry.domain
      && other.entry.id !== span.entry.id
      && other.start <= span.start
      && other.end >= span.end
      && (other.end - other.start) > (span.end - span.start),
    );
    if (!containedBySpecificSameDomain) accepted.push(span);
  }

  const replacements = accepted.flatMap((span) => {
    const contained = spans.filter((other) =>
      other.entry.domain === span.entry.domain
      && other.entry.id !== span.entry.id
      && span.start <= other.start
      && span.end >= other.end,
    );
    const replacement = disambiguatingAlias(span, contained);
    return replacement && replacement.toLowerCase() !== span.alias
      ? [{ start: span.start, end: span.end, replacement }]
      : [];
  }).sort((left, right) => right.start - left.start);

  let rewritten = query;
  for (const replacement of replacements) {
    rewritten = `${rewritten.slice(0, replacement.start)}${replacement.replacement}${rewritten.slice(replacement.end)}`;
  }
  return rewritten;
}
