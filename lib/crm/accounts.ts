import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logAdminAuditEvent } from "@/lib/admin-audit-log";
import { normalizeAccountType, normalizeLifecycle } from "./validation";
export async function createAccount(input:{name:string;accountType:string;lifecycleStage:string;ownerUserId?:string|null},actor:{user_id:string;email:string|null;role:string}){ const row={name:input.name.trim(),account_type:normalizeAccountType(input.accountType),lifecycle_stage:normalizeLifecycle(input.lifecycleStage),owner_user_id:input.ownerUserId||null,created_by:actor.user_id,updated_by:actor.user_id};if(!row.name)throw new Error("Account name is required");const {data,error}=await supabaseAdmin.from("crm_accounts").insert(row).select("*").single();if(error)throw error;await logAdminAuditEvent({actor,action:"crm_account_created",entityType:"crm_account",entityId:data.id,afterData:row});return data}

