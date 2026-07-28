import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
export async function recordSequenceEvent(enrollmentId:string,eventType:string,metadata:Record<string,unknown>={}){const {error}=await supabaseAdmin.from("crm_sequence_events").insert({enrollment_id:enrollmentId,event_type:eventType,metadata});if(error)throw error}

