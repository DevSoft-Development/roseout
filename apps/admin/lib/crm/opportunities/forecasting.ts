import type { HealthResult, OpportunityRecord } from "./types";
import { weightedAmount } from "./validation";

export function stageAgeDays(changedAt: string, now = new Date()) { return Math.max(0, Math.floor((now.getTime() - new Date(changedAt).getTime()) / 86_400_000)); }
export function opportunityHealth(o: OpportunityRecord, maxDays = 30, now = new Date()): HealthResult {
  if (o.status !== "open") return { status: "healthy", reasons: [] };
  const reasons: string[] = [];
  if (!o.next_step?.trim()) reasons.push("No next step");
  if (o.next_step_at && new Date(o.next_step_at) < now) reasons.push("Next step overdue");
  if (o.expected_close_date && new Date(`${o.expected_close_date}T23:59:59Z`) < now) reasons.push("Close date is past due");
  if (stageAgeDays(o.last_stage_changed_at, now) > maxDays) reasons.push("Stage age exceeds limit");
  if (!o.primary_contact_id) reasons.push("No primary contact");
  if (o.forecast_category === "commit" && o.risk_level === "critical") reasons.push("Commit has critical risk");
  if (reasons.includes("Stage age exceeds limit") && (!o.last_activity_at || (now.getTime() - new Date(o.last_activity_at).getTime()) / 86_400_000 > maxDays)) return { status: "stalled", reasons };
  if (reasons.some((r) => r.includes("past due") || r.includes("critical"))) return { status: "at_risk", reasons };
  return { status: reasons.length ? "attention" : "healthy", reasons };
}
export function forecastTotals(rows: OpportunityRecord[]) {
  return rows.reduce((a, o) => { const amount = o.amount ?? 0; if (o.status === "open" && o.forecast_category !== "omitted") a.pipeline += amount; a.weighted += weightedAmount(amount, o.probability); if (o.forecast_category === "best_case") a.bestCase += amount; if (o.forecast_category === "commit") a.commit += amount; if (o.forecast_category === "closed" && o.status === "won") a.closed += amount; return a; }, { pipeline: 0, weighted: 0, bestCase: 0, commit: 0, closed: 0 });
}

