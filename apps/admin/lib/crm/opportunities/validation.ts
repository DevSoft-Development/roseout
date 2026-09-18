import { CRM_PIPELINES, type PipelineKey } from "../pipelines";
import type { OpportunityRecord } from "./types";

export const TRANSITIONS: Record<PipelineKey, Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(CRM_PIPELINES).map(([pipeline, stages]) => [pipeline, Object.fromEntries(stages.map((stage, index) => {
    const terminalLoss = stages.find((candidate) => candidate === "closed_lost" || candidate === "churned");
    return [stage, [...stages.slice(index + 1, index + 2), ...(terminalLoss && terminalLoss !== stage && stages[index + 1] !== terminalLoss ? [terminalLoss] : [])]];
  }))]),
) as unknown as Record<PipelineKey, Record<string, readonly string[]>>;

export function weightedAmount(amount: number | null | undefined, probability: number | null | undefined) {
  return Math.round(((amount ?? 0) * (probability ?? 0) / 100) * 100) / 100;
}
export function assertPipelineStage(pipeline: PipelineKey, stage: string) {
  if (!(CRM_PIPELINES[pipeline] as readonly string[])?.includes(stage)) throw new Error(`Stage '${stage}' is not valid for ${pipeline}.`);
}
export function validateTransition(opportunity: OpportunityRecord, toStage: string, options: { override?: boolean; reason?: string; productCount?: number; expansionCount?: number } = {}) {
  assertPipelineStage(opportunity.pipeline_key, toStage);
  if (!options.override && !TRANSITIONS[opportunity.pipeline_key][opportunity.stage]?.includes(toStage)) throw new Error(`Transition from ${opportunity.stage} to ${toStage} is not allowed.`);
  if (options.override && !options.reason?.trim()) throw new Error("An override reason is required.");
  const commercialProposal = ["proposal", "negotiation", "payment_pending", "closed_won", "active", "renewed", "expanded"];
  if (commercialProposal.includes(toStage) && !opportunity.amount && !options.productCount) throw new Error("An amount or product is required.");
  if (["negotiation", "payment_pending"].includes(toStage) && (!opportunity.next_step?.trim() || !opportunity.expected_close_date)) throw new Error("A next step and expected close date are required.");
  if (toStage === "payment_pending" && !opportunity.proposal_url && !opportunity.contract_url && !opportunity.proposal_status && !opportunity.contract_status) throw new Error("Proposal or contract context is required.");
  if (toStage === "closed_won" && (!opportunity.account_id || !opportunity.amount || !opportunity.expected_close_date || !opportunity.owner_user_id)) throw new Error("Account, amount, close date, and owner are required to close won.");
  if (toStage === "closed_lost" && !opportunity.loss_reason?.trim()) throw new Error("A loss reason is required.");
  if (toStage === "renewed" && (!opportunity.amount || !opportunity.expected_close_date)) throw new Error("Renewal value and effective date are required.");
  if (toStage === "expanded" && !options.expansionCount && !options.productCount) throw new Error("An expansion product or location is required.");
}
