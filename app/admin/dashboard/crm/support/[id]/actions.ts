"use server";
import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/admin-auth";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { createTask } from "@/lib/crm/tasks/service";
import { createSupportReply } from "@/lib/support";
import { sendSupportTicketSmsReply } from "@/lib/support/sms-routing";
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES, addCanonicalSupportMessage, assignCanonicalSupportTicket, isSupportPriority, isSupportStatus, markCanonicalSupportEscalated, updateCanonicalSupportPriority, updateCanonicalSupportStatus } from "@/lib/support/canonical";
import { addSupportTags, getSupportMacro, setSupportGroup, setSupportTags, validateMacroPriority, validateMacroStatus } from "@/lib/support/operations";
function refresh(id:string){revalidatePath(`/admin/dashboard/crm/support/${id}`);revalidatePath("/admin/dashboard/crm/support");revalidatePath("/admin/dashboard/support");revalidatePath("/admin/dashboard/team/support-work");}
async function replyToCustomer(ticketId:string,body:string,actor:any){
 const authorName=actor.full_name||actor.email||"TheOutHaven Support";
 const sms=await sendSupportTicketSmsReply({ticketId,body,authorName,authorEmail:actor.email||null});
 if(sms)return sms;
 return createSupportReply({ticketId,actorType:"admin",authorName,authorEmail:actor.email||undefined,message:body});
}
export async function supportCaseAction(formData: FormData) {
 const actor=await requireAdminRole(CRM_WRITE_ROLES); const ticketId=String(formData.get("ticket_id")||"").trim(); const operation=String(formData.get("operation")||"").trim(); if(!ticketId) throw new Error("Ticket is required.");
 if(operation==="assign_self") await assignCanonicalSupportTicket(ticketId,{userId:actor.user_id,email:actor.email||null,name:actor.full_name||actor.email||"Support agent",actorUserId:actor.user_id});
 else if(operation==="unassign") await assignCanonicalSupportTicket(ticketId,{actorUserId:actor.user_id});
 else if(operation==="group") await setSupportGroup(ticketId,String(formData.get("group")||"")||null);
 else if(operation==="tags") await setSupportTags(ticketId,String(formData.get("tags")||"").split(","));
 else if(operation==="status"){const status=String(formData.get("status")||"");if(!isSupportStatus(status))throw new Error(`Unsupported status. Use one of: ${SUPPORT_STATUSES.join(", ")}`);await updateCanonicalSupportStatus(ticketId,status,actor.user_id);}
 else if(operation==="priority"){const priority=String(formData.get("priority")||"");if(!isSupportPriority(priority))throw new Error(`Unsupported priority. Use one of: ${SUPPORT_PRIORITIES.join(", ")}`);await updateCanonicalSupportPriority(ticketId,priority,actor.user_id);}
 else if(operation==="reply") await replyToCustomer(ticketId,String(formData.get("body")||""),actor);
 else if(operation==="internal_note") await addCanonicalSupportMessage({ticketId,body:String(formData.get("body")||""),actorUserId:actor.user_id,actorName:actor.full_name||actor.email||"TheOutHaven Support",actorEmail:actor.email||null,internalNote:true,senderRole:"admin"});
 else if(operation==="macro") { const macro=await getSupportMacro(String(formData.get("macro_key")||"")); if(macro.body) await replyToCustomer(ticketId,macro.body,actor); const status=validateMacroStatus(macro.set_status); const priority=validateMacroPriority(macro.set_priority); if(status) await updateCanonicalSupportStatus(ticketId,status,actor.user_id); if(priority) await updateCanonicalSupportPriority(ticketId,priority,actor.user_id); if(macro.assigned_group) await setSupportGroup(ticketId,macro.assigned_group); if(macro.tags?.length) await addSupportTags(ticketId,macro.tags); }
 else if(operation==="escalate") await markCanonicalSupportEscalated(ticketId,actor.user_id); else if(operation==="resolve") await updateCanonicalSupportStatus(ticketId,"resolved",actor.user_id); else if(operation==="reopen") await updateCanonicalSupportStatus(ticketId,"reopened",actor.user_id);
 else if(operation==="create_task"){await createTask({title:String(formData.get("title")||`Follow up on support ticket ${ticketId}`),description:String(formData.get("description")||`Created from support ticket ${ticketId}`),queue_key:"support",task_type:"follow_up",priority:String(formData.get("task_priority")||"normal"),location_id:String(formData.get("location_id")||"").trim()||null,source:"support_ticket",source_record_id:ticketId},actor);await addCanonicalSupportMessage({ticketId,body:"CRM follow-up task created from this support case.",actorUserId:actor.user_id,actorName:actor.full_name||actor.email||"TheOutHaven Support",actorEmail:actor.email||null,internalNote:true,senderRole:"admin"});}
 else throw new Error("Unsupported support action."); refresh(ticketId);
}
