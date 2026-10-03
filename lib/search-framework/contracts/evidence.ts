export const SEARCH_FRAMEWORK_CONTRACT_VERSION = "search-framework-v3-alpha.1" as const;

export type EvidenceSource =
  | "owner_verified"
  | "authoritative_location"
  | "menu"
  | "reservation_provider"
  | "review"
  | "review_ml"
  | "photo_ml"
  | "behavioral"
  | "knowledge_graph"
  | "search_profile"
  | "manual_override"
  | "derived"
  | (string & {});

export type EvidenceConfidence = number;

export interface FactEvidence<T = unknown> {
  value: T;
  source: EvidenceSource;
  confidence: EvidenceConfidence;
  freshness: string | null;
  verifiedAt: string | null;
  evidenceIds?: readonly string[];
  modelVersion?: string | null;
  metadata?: Readonly<Record<string, unknown>>;
}

export function factEvidence<T>(
  value: T,
  source: EvidenceSource,
  options: Partial<Omit<FactEvidence<T>, "value" | "source">> = {},
): FactEvidence<T> {
  return {
    value,
    source,
    confidence: normalizeConfidence(options.confidence ?? 1),
    freshness: options.freshness ?? null,
    verifiedAt: options.verifiedAt ?? null,
    evidenceIds: options.evidenceIds,
    modelVersion: options.modelVersion ?? null,
    metadata: options.metadata,
  };
}

export function normalizeConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
