import type { KnowledgeEntity } from "./graph";

export type EntityResolutionStatus =
  | "resolved"
  | "ambiguous"
  | "not_found";

export interface EntityResolutionCandidate {
  entity: KnowledgeEntity;
  matchedText: string;
  normalizedQuery: string;
  score: number;
  source: "alias_exact" | "canonical_exact" | "alias_fuzzy" | "canonical_fuzzy";
}

export interface EntityResolution {
  status: EntityResolutionStatus;
  query: string;
  normalizedQuery: string;
  entity: KnowledgeEntity | null;
  candidates: readonly EntityResolutionCandidate[];
  confidence: number | null;
  source: EntityResolutionCandidate["source"] | "none";
  metadata: Readonly<Record<string, unknown>>;
}
