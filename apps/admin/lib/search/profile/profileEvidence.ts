import type { EvidenceStrength, LocationProfileSource, ProfileEvidence } from "./profileTypes";

export function evidence(field: keyof LocationProfileSource, source: string, value: string, strength: EvidenceStrength): ProfileEvidence {
  return { field, source, value, strength };
}

export function hasStrongEvidence(items: readonly ProfileEvidence[], value: string): boolean {
  return items.some((item) => item.value === value && item.strength !== "supporting");
}
