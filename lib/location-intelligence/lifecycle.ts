import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export const LOCATION_INTELLIGENCE_STAGES = [
  "intake",
  "normalize",
  "google_identity",
  "google_details",
  "website",
  "reservations",
  "photos",
  "classification",
  "search_profile",
  "dedupe",
  "publishability",
  "complete",
] as const;

export type LocationIntelligenceStage = (typeof LOCATION_INTELLIGENCE_STAGES)[number];
export type LocationIntelligenceStageStatus =
  | "pending"
  | "running"
  | "completed"
  | "review"
  | "blocked"
  | "failed"
  | "skipped";

export type LocationIntelligenceLifecycleStatus =
  | "pending"
  | "running"
  | "review"
  | "blocked"
  | "failed"
  | "complete";

export type LocationIntelligenceState = {
  location_id: string;
  lifecycle_status: LocationIntelligenceLifecycleStatus;
  current_stage: LocationIntelligenceStage;
  stage_statuses: Record<string, unknown>;
  stage_attempts: Record<string, number>;
  last_error_code: string | null;
  last_error: string | null;
  next_retry_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_transition_at: string;
  source_precedence_version: number;
  created_at: string;
  updated_at: string;
};

export const TERMINAL_STAGE_STATUSES = new Set<LocationIntelligenceStageStatus>([
  "completed",
  "review",
  "blocked",
  "failed",
  "skipped",
]);

export function stageAfter(stage: LocationIntelligenceStage): LocationIntelligenceStage | null {
  const index = LOCATION_INTELLIGENCE_STAGES.indexOf(stage);
  return index >= 0 && index < LOCATION_INTELLIGENCE_STAGES.length - 1
    ? LOCATION_INTELLIGENCE_STAGES[index + 1]
    : null;
}

export async function readLocationIntelligenceState(locationId: string) {
  const { data, error } = await supabaseAdmin
    .from("location_intelligence_state")
    .select("*")
    .eq("location_id", locationId)
    .maybeSingle();
  if (error) throw new Error(`Location Intelligence state read failed: ${error.message}`);
  return data as LocationIntelligenceState | null;
}

export async function recordLocationIntelligenceStage(input: {
  locationId: string;
  stage: LocationIntelligenceStage;
  status: LocationIntelligenceStageStatus;
  eventType?: string;
  errorCode?: string | null;
  error?: string | null;
  nextRetryAt?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabaseAdmin.rpc("record_location_intelligence_stage", {
    p_location_id: input.locationId,
    p_stage: input.stage,
    p_status: input.status,
    p_event_type: input.eventType || "stage_transition",
    p_error_code: input.errorCode ?? null,
    p_error: input.error ?? null,
    p_next_retry_at: input.nextRetryAt ?? null,
    p_metadata: input.metadata || {},
  });
  if (error) throw new Error(`Location Intelligence stage transition failed: ${error.message}`);
  return data as LocationIntelligenceState;
}

export async function ensureLocationIntelligenceState(locationId: string, metadata: Record<string, unknown> = {}) {
  const existing = await readLocationIntelligenceState(locationId);
  if (existing) return existing;
  return recordLocationIntelligenceStage({
    locationId,
    stage: "intake",
    status: "pending",
    eventType: "lifecycle_created",
    metadata,
  });
}
