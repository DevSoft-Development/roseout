import type { FactEvidence } from "./evidence";

export type KnowledgeEntityType =
  | "location"
  | "restaurant"
  | "activity"
  | "venue"
  | "landmark"
  | "neighborhood"
  | "borough"
  | "city"
  | "zip_code"
  | "market"
  | "cuisine"
  | "food"
  | "dish"
  | "meal_period"
  | "feature"
  | "offering"
  | "activity_type"
  | "nightlife_type"
  | "vibe"
  | "occasion"
  | "audience"
  | "brand"
  | "reservation_provider"
  | "event"
  | (string & {});

export interface KnowledgeEntity {
  id: string;
  entityType: KnowledgeEntityType;
  canonicalKey: string;
  canonicalName: string;
  locationId: string | null;
  attributes: Readonly<Record<string, unknown>>;
  confidence: number;
  source: string;
  sourceUpdatedAt: string | null;
}

export interface KnowledgeEdge {
  id: string;
  subjectEntityId: string;
  predicate: string;
  objectEntityId: string;
  confidence: number;
  source: string;
  validFrom: string | null;
  validTo: string | null;
}

export interface KnowledgeEntityContext {
  entity: KnowledgeEntity;
  aliases: readonly string[];
  features: Readonly<Record<string, FactEvidence>>;
  outgoing: readonly KnowledgeEdge[];
  incoming: readonly KnowledgeEdge[];
  evidence: readonly Readonly<Record<string, unknown>>[];
}
