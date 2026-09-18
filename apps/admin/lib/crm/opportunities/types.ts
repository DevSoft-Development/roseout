import type { AdminRole } from "@/lib/users/roles";
import type { PipelineKey } from "../pipelines";

export const FORECAST_CATEGORIES = ["pipeline", "best_case", "commit", "closed", "omitted"] as const;
export type ForecastCategory = (typeof FORECAST_CATEGORIES)[number];
export type OpportunityActor = { user_id: string; role: AdminRole; team_key?: string | null };
export type OpportunityRecord = {
  id: string; account_id: string; name: string; pipeline_key: PipelineKey; stage: string;
  status: "open" | "won" | "lost"; owner_user_id: string | null; assigned_team?: string | null;
  amount: number | null; probability: number | null; forecast_category: ForecastCategory;
  expected_close_date: string | null; actual_close_date?: string | null; next_step: string | null;
  next_step_at: string | null; primary_contact_id: string | null; primary_location_id: string | null;
  loss_reason: string | null; loss_category?: string | null; proposal_url?: string | null;
  proposal_status?: string | null; contract_url?: string | null; contract_status?: string | null;
  risk_level?: string | null; risk_summary?: string | null; last_stage_changed_at: string;
  last_activity_at?: string | null; version: number; archived_at?: string | null;
};
export type HealthResult = { status: "healthy" | "attention" | "at_risk" | "stalled"; reasons: string[] };
export class OpportunityError extends Error { constructor(public code: string, message: string) { super(message); } }

