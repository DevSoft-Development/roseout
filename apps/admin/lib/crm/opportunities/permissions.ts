import type { OpportunityActor, OpportunityRecord } from "./types";
const READ_ONLY = new Set(["reviewer", "viewer"]);
export function canReadOpportunity(actor: OpportunityActor, opportunity: OpportunityRecord) { return ["superadmin", "admin", "manager", "experience_team", "editor", "reviewer", "viewer"].includes(actor.role) || opportunity.owner_user_id === actor.user_id || (!!actor.team_key && actor.team_key === opportunity.assigned_team); }
export function canMutateOpportunity(actor: OpportunityActor, opportunity: OpportunityRecord) { if (READ_ONLY.has(actor.role)) return false; if (["superadmin", "admin", "manager"].includes(actor.role)) return true; return opportunity.owner_user_id === actor.user_id || (!!actor.team_key && actor.team_key === opportunity.assigned_team); }
export function canOverrideTransition(actor: OpportunityActor) { return ["superadmin", "admin", "manager"].includes(actor.role); }
export function requiredDiscountRole(percent: number) { return percent > 20 ? "admin" : percent > 10 ? "manager" : "owner"; }

