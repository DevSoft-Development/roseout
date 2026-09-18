import "server-only";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export type SearchParams = Record<string, string | undefined>;

const PAGE_SIZE=25;
const esc=(value:string)=>value.replace(/[%_]/g,"\\$&");

export async function listOutreach(p:SearchParams){
  const db=getAdminDatabaseClient();
  const page=Math.max(1,Number(p.page)||1);
  const from=(page-1)*PAGE_SIZE;
  const to=page*PAGE_SIZE-1;
  let q=db.from("crm_tasks")
    .select("*,crm_accounts(id,name),locations(id,name,city,state),crm_contacts(id,full_name,email),crm_opportunities(id,name)",{count:"exact"})
    .in("task_type",["social_outreach","phone_outreach","email_outreach","site_visit","follow_up","claim_code_delivery","owner_meeting"])
    .is("archived_at",null);
  if(p.status) q=q.eq("status",p.status);
  if(p.channel) q=q.eq("task_type",p.channel);
  if(p.location_id) q=q.eq("location_id",p.location_id);
  if(p.account_id) q=q.eq("account_id",p.account_id);
  if(p.contact_id) q=q.eq("contact_id",p.contact_id);
  if(p.opportunity_id) q=q.eq("opportunity_id",p.opportunity_id);
  if(p.q) q=q.ilike("title",`%${esc(p.q)}%`);
  const {data,error,count}=await q.order("updated_at",{ascending:false}).range(from,to);
  if(error) throw error;
  return {rows:data??[],count:count??0,page,from,to};
}
