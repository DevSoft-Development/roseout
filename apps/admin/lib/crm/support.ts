import "server-only";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export type SearchParams = Record<string, string | undefined>;
const pageSize=25;
const esc=(v:string)=>v.replace(/[%_]/g,"\\$&");

export async function listSupport(p: SearchParams) {
  const db=getAdminDatabaseClient();
  const page=Math.max(1,Number(p.page)||1), from=(page-1)*pageSize, to=page*pageSize-1;
  let q=db.from("support_tickets").select("*",{count:"exact"});
  if (p.queue === "new") q = q.eq("status", "new");
  else if (p.queue === "mine" && p.assigned_to) q = q.eq("assigned_to", p.assigned_to);
  else if (p.queue === "unassigned") q = q.is("assigned_to", null);
  else if (p.queue === "waiting_on_customer") q = q.eq("status", "waiting_on_customer");
  else if (p.queue === "waiting_on_internal") q = q.eq("status", "waiting_on_internal");
  else if (p.queue === "escalated") q = q.eq("status", "escalated");
  else if (p.queue === "sla_breached") q = q.contains("metadata", { sla_breached: true });
  else if (p.queue === "urgent") q = q.eq("priority", "urgent");
  else if (p.queue === "billing") q = q.eq("assigned_group", "billing");
  else if (p.queue === "reservations") q = q.eq("assigned_group", "reservations");
  else if (p.queue === "location_support") q = q.eq("assigned_group", "location_success");
  else if (p.queue === "reopened") q = q.eq("status", "reopened");
  if (p.status) q = q.eq("status", p.status);
  if (p.priority) q = q.eq("priority", p.priority);
  if (p.category) q = q.eq("category", p.category);
  if (p.group) q = q.eq("assigned_group", p.group);
  if (p.tag) q = q.contains("tags", [p.tag]);
  if (p.q) {
    const term=esc(p.q);
    q=q.or(`subject.ilike.%${term}%,email.ilike.%${term}%,requester_email.ilike.%${term}%`);
  }
  const {data,error,count}=await q.order("updated_at",{ascending:false}).range(from,to);
  if(error) throw error;
  return {rows:data??[],count:count??0,page,from,to};
}
