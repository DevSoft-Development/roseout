import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ClaimedStep } from "./types";
export async function claimDueSteps(workerId:string,limit:number,leaseSeconds:number):Promise<ClaimedStep[]>{const {data,error}=await supabaseAdmin.rpc("crm_claim_due_sequence_enrollments",{p_worker_id:workerId,p_limit:limit,p_lease_seconds:leaseSeconds});if(error)throw error;return (data??[]) as ClaimedStep[]}

