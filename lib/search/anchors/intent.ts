import { normalizeAnchorText } from "./normalize";

const GENERIC_ANCHOR_PATTERNS = [
  /^(?:a|an|the)?\s*(?:skating|ice skating|roller skating)\s*(?:rink|center|centre)?$/i,
  /^(?:a|an|the)?\s*(?:museum|art museum|history museum|science museum)$/i,
  /^(?:a|an|the)?\s*(?:arcade|gaming center|game center)$/i,
  /^(?:a|an|the)?\s*(?:theater|theatre|movie theater|cinema)$/i,
  /^(?:a|an|the)?\s*(?:bowling alley|bowling)$/i,
  /^(?:a|an|the)?\s*(?:park|zoo|aquarium|stadium|arena)$/i,
];

export type AnchorIntentKind = "named" | "generic";

export function classifyAnchorIntent(rawName: string): AnchorIntentKind {
  const normalized = normalizeAnchorText(rawName);
  if (!normalized) return "generic";
  return GENERIC_ANCHOR_PATTERNS.some((pattern) => pattern.test(normalized))
    ? "generic"
    : "named";
}

export function anchorAreaText(row: any) {
  return [
    row.neighborhood,
    row.borough,
    row.city,
    row.county,
    row.state,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesAnchorArea(row: any, areaHint?: string | null) {
  if (!areaHint) return true;
  const normalizedHint = normalizeAnchorText(areaHint);
  if (!normalizedHint) return true;
  return anchorAreaText(row).includes(normalizedHint);
}

export function anchorCandidateSummary(row: any) {
  return {
    id: row.linkedLocationId ?? row.linked_location_id ?? row.id ?? null,
    registryId: row.registryId ?? null,
    name: row.canonicalName ?? row.canonical_name ?? row.name ?? null,
    city: row.city ?? null,
    borough: row.borough ?? null,
    neighborhood: row.neighborhood ?? null,
    state: row.state ?? null,
    latitude: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null,
    longitude: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null,
    confidence: Number.isFinite(Number(row.confidence))
      ? Number(row.confidence)
      : null,
  };
}
