export type CanonicalEligibilitySource = {
  status?: string | null;
  isSearchable?: boolean | null;
  isHidden?: boolean | null;
  isLowLevel?: boolean | null;
};

export type CanonicalEligibility = {
  backingSourceCount: number;
  active: boolean;
  isSearchable: boolean;
  isHidden: boolean;
  isLowLevel: boolean;
};

const ACTIVE_SOURCE_STATUSES = new Set(["approved", "active", "published", "live"]);

export function isCanonicalSourceActive(source: CanonicalEligibilitySource) {
  const normalized = source.status?.trim().toLowerCase();
  return normalized ? ACTIVE_SOURCE_STATUSES.has(normalized) : true;
}

export function aggregateCanonicalEligibility(
  sources: readonly CanonicalEligibilitySource[],
): CanonicalEligibility {
  if (sources.length === 0) {
    return {
      backingSourceCount: 0,
      active: false,
      isSearchable: false,
      isHidden: false,
      isLowLevel: false,
    };
  }

  const normalized = sources.map((source) => ({
    active: isCanonicalSourceActive(source),
    searchable: source.isSearchable === true,
    hidden: source.isHidden === true,
    lowLevel: source.isLowLevel === true,
  }));

  return {
    backingSourceCount: sources.length,
    active: normalized.some((source) => source.active),
    isSearchable: normalized.some(
      (source) => source.active && source.searchable && !source.hidden && !source.lowLevel,
    ),
    isHidden: normalized.every((source) => source.hidden),
    isLowLevel: normalized.every((source) => source.lowLevel),
  };
}
