export const CRM_PIPELINES = {
 business_claim:["identified","outreach_pending","contacted","engaged","claim_sent","claim_started","claim_review","claimed","closed_lost"],
 reserve_pro:["identified","qualified","demo_scheduled","demo_completed","proposal","negotiation","payment_pending","closed_won","closed_lost"],
 promoted_listing:["identified","qualified","proposal","payment_pending","active","closed_lost"],
 partnership:["identified","discovery","qualified","proposal","legal_review","closed_won","closed_lost"],
 renewal_expansion:["upcoming","review","expansion_identified","proposal","negotiation","renewed","expanded","churned"],
} as const;
export type PipelineKey = keyof typeof CRM_PIPELINES;
export function validateStage(pipeline:PipelineKey, stage:string, lossReason?:string|null) { if (!(CRM_PIPELINES[pipeline] as readonly string[]).includes(stage)) throw new Error(`Invalid stage '${stage}' for ${pipeline}`); if(stage==="closed_lost"&&!lossReason?.trim()) throw new Error("A loss reason is required"); return stage; }
export function isTerminalStage(stage:string){return ["closed_won","closed_lost","claimed","active","renewed","expanded","churned"].includes(stage)}

