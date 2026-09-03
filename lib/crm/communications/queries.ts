import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
const PAGE_SIZE = 25;
export async function getCommunicationOverview() {
 const today = new Date(); today.setUTCHours(0,0,0,0);
 const [open, unread, waiting, sent, failed, approvals, sequences, replies] = await Promise.all([
  supabaseAdmin.from("crm_conversations").select("id",{count:"exact",head:true}).in("status",["open","waiting_on_customer","waiting_on_team"]),
  supabaseAdmin.from("crm_conversations").select("id",{count:"exact",head:true}).eq("is_unread",true),
  supabaseAdmin.from("crm_conversations").select("id",{count:"exact",head:true}).eq("status","waiting_on_team"),
  supabaseAdmin.from("crm_messages").select("id",{count:"exact",head:true}).gte("sent_at",today.toISOString()),
  supabaseAdmin.from("crm_messages").select("id",{count:"exact",head:true}).in("status",["failed","bounced"]),
  supabaseAdmin.from("crm_communication_approvals").select("id",{count:"exact",head:true}).eq("status","pending"),
  supabaseAdmin.from("crm_sequence_enrollments").select("id",{count:"exact",head:true}).eq("status","active"),
  supabaseAdmin.from("crm_messages").select("id",{count:"exact",head:true}).eq("direction","inbound").gte("created_at",today.toISOString())]);
 return { open:open.count||0, unread:unread.count||0, waiting:waiting.count||0, sent:sent.count||0, failed:failed.count||0, approvals:approvals.count||0, sequences:sequences.count||0, replies:replies.count||0 };
}
export async function listConversations(page=1) {
 const from=Math.max(0,page-1)*PAGE_SIZE; const result=await supabaseAdmin.from("crm_conversations").select("id,subject,channel,status,priority,last_message_at,unread_count,assigned_team,owner_user_id,contact_id,account_id,location_id,opportunity_id",{count:"exact"}).is("archived_at",null).order("last_message_at",{ascending:false,nullsFirst:false}).range(from,from+PAGE_SIZE-1);
 return { rows: result.data||[], count:result.count||0, page, pageSize:PAGE_SIZE, error:result.error?.message };
}
export async function getConversation(id:string) {
 const conversation=await supabaseAdmin.from("crm_conversations").select("*").eq("id",id).single();
 const messages=await supabaseAdmin.from("crm_messages").select("id,direction,channel,message_type,sender_user_id,subject,body_text,body_html,preview_text,status,sent_at,delivered_at,failed_at,failure_reason,is_internal,created_at").eq("conversation_id",id).is("archived_at",null).order("created_at").limit(100);
 return { conversation:conversation.data, messages:messages.data||[], error:conversation.error?.message };
}
