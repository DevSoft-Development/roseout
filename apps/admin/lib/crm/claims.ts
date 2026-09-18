import "server-only";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { isUuid } from "./context";

export type SearchParams = Record<string, string | undefined>;
export type CanonicalClaimStatus = "new"|"in_review"|"information_needed"|"approved"|"rejected"|"expired"|"duplicate"|"escalated"|"cancelled";
export type NormalizedClaim = { id:string; source:string; sourceId:string; locationId:string|null; accountId:string|null; claimantUserId:string|null; claimantName:string|null; claimantEmail:string|null; claimantPhone:string|null; submittedBusinessName:string|null; status:CanonicalClaimStatus; reviewerId:string|null; assignedTeamId:string|null; riskLevel:string|null; verificationState:string|null; submittedAt:string; updatedAt:string; reviewedAt:string|null; metadata:Record<string,unknown> };

export class ClaimsQueryError extends Error {
  code:string; safeMessage:string; source?:string; retryable:boolean;
  constructor(code:string,safeMessage:string,opts:{source?:string;retryable?:boolean;cause?:unknown}={}) {
    super(safeMessage);
    this.code=code;
    this.safeMessage=safeMessage;
    this.source=opts.source;
    this.retryable=opts.retryable??false;
    if(opts.cause) (this as any).cause=opts.cause;
  }
}

const statusMap: Record<string,CanonicalClaimStatus>={ pending:"new", submitted:"new", open:"new", under_review:"in_review", reviewing:"in_review", in_review:"in_review", needs_info:"information_needed", more_info_required:"information_needed", information_needed:"information_needed", verified:"approved", accepted:"approved", approved:"approved", denied:"rejected", declined:"rejected", rejected:"rejected", closed:"cancelled", duplicate_detected:"duplicate", duplicate:"duplicate", escalation_required:"escalated", escalated:"escalated", expired:"expired", cancelled:"cancelled" };
const pageSize = 25;
const paging = (p: SearchParams) => { const page=Math.max(1,Number(p.page)||1); return {page,from:(page-1)*pageSize,to:page*pageSize-1}; };

export function normalizeClaimStatus(raw?: string|null): CanonicalClaimStatus { return statusMap[String(raw||"pending").toLowerCase()] || "new"; }
export function getClaimSourceStatusFilter(status: string) { const s=normalizeClaimStatus(status); return Object.entries(statusMap).filter(([,v])=>v===s).map(([k])=>k); }
function normalize(r:any, accounts = new Map<string,string>()): NormalizedClaim { return { id:r.id, source:"location_claim_requests", sourceId:r.id, locationId:r.location_id??null, accountId:r.location_id?accounts.get(r.location_id)??null:null, claimantUserId:r.user_id??null, claimantName:r.owner_name??null, claimantEmail:r.owner_email??null, claimantPhone:r.owner_phone??null, submittedBusinessName:r.location_name??null, status:normalizeClaimStatus(r.status), reviewerId:r.reviewed_by??null, assignedTeamId:null, riskLevel:r.match_status === "conflict" ? "high" : null, verificationState:r.verification_status??r.match_status??null, submittedAt:r.submitted_at??r.created_at, updatedAt:r.updated_at??r.submitted_at??r.created_at, reviewedAt:r.reviewed_at??null, metadata:{requestType:r.request_type, planInterest:r.plan_interest, sourceStatus:r.status, website:r.website} }; }

export async function listClaims(p: SearchParams) {
  const db=getAdminDatabaseClient();
  const pg=paging(p);
  let q=db.from("location_claim_requests").select("*",{count:"exact"});
  if(p.location_id&&isUuid(p.location_id)) q=q.eq("location_id",p.location_id);
  if(p.status) q=q.in("status",getClaimSourceStatusFilter(p.status));
  if(p.source&&p.source!=="location_claim_requests") throw new ClaimsQueryError("CLAIMS_INVALID_FILTER","Unsupported claim source filter.");
  if(p.q) {
    const term=p.q.replace(/[%_]/g,"\\$&");
    q=q.or(`location_name.ilike.%${term}%,owner_email.ilike.%${term}%,owner_phone.ilike.%${term}%`);
  }
  const {data,error,count}=await q.order("submitted_at",{ascending:false}).range(pg.from,pg.to);
  if(error) throw new ClaimsQueryError("CLAIMS_QUERY_FAILED","Claims could not be loaded right now.",{source:"location_claim_requests",retryable:true,cause:error});
  const locIds=[...new Set((data??[]).map((r:any)=>r.location_id).filter(Boolean))] as string[];
  const accounts=new Map<string,string>();
  if(locIds.length){
    const {data:rels}=await db.from("crm_account_locations").select("location_id,account_id").in("location_id",locIds).eq("status","active");
    for(const r of rels??[]) accounts.set(r.location_id,r.account_id);
  }
  let rows=(data??[]).map((r:any)=>normalize(r,accounts));
  if(p.account_id&&isUuid(p.account_id)) rows=rows.filter(r=>r.accountId===p.account_id);
  return {rows,count:p.account_id?rows.length:count??0,page:pg.page,pageSize,warnings:[],sourceHealth:[{source:"location_claim_requests",available:true,canonical:true}]};
}

export async function getClaim(id:string){
  const db=getAdminDatabaseClient();
  const {data,error}=await db.from("location_claim_requests").select("*").eq("id",id).single();
  if(error) throw new ClaimsQueryError("CLAIMS_QUERY_FAILED","Claim could not be loaded right now.",{source:"location_claim_requests",retryable:true,cause:error});
  const claim=normalize(data);
  const [{data:codes},{data:tasks},{data:activities}]=await Promise.all([
    claim.locationId ? db.from("location_claim_codes").select("*").eq("location_id",claim.locationId).order("created_at",{ascending:false}).limit(50) : Promise.resolve({data:[]} as any),
    db.from("crm_tasks").select("*").eq("source_record_id",id).is("archived_at",null).limit(50),
    db.from("crm_activities").select("*").eq("source_record_id",id).order("occurred_at",{ascending:false}).limit(100),
  ]);
  return {claim,codes:codes??[],tasks:tasks??[],activities:activities??[]};
}
