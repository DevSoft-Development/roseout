import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requirePublicEnv, requireSupabaseUrl } from "@/lib/env";
import { getSiteUrl } from "@/lib/site-url";

export const adminUserAccessRoles = ADMIN_PAGE_ACCESS.experienceInboxManage;
export async function requireAdminOrSupport(){return requireAdminRole(adminUserAccessRoles)}
export function like(s?:string|null){return `%${String(s||"").trim().replace(/[%,]/g,"")}%`}
async function safe<T>(fn:()=>Promise<T>, fallback:T){try{return await fn()}catch{return fallback}}
export async function listAdminUsers(filters:{q?:string; role?:string; beta?:string; plan?:string; status?:string; tickets?:string; booked?:string; page?:number}){
 await requireAdminOrSupport(); const page=Math.max(1,Number(filters.page||1)); const per=25; const from=(page-1)*per;
 let q=supabaseAdmin.from("user_profiles").select("*",{count:"exact"}).order("created_at",{ascending:false}).range(from,from+per-1);
 if(filters.q){const v=like(filters.q); q=q.or(`full_name.ilike.${v},preferred_name.ilike.${v},email.ilike.${v},phone.ilike.${v},mobile_number.ilike.${v},zip_code.ilike.${v}`)}
 if(filters.role&&filters.role!=="all") q=q.eq("role",filters.role); if(filters.status&&filters.status!=="all") q=q.eq("account_status",filters.status);
 const {data,error,count}=await q; if(error) throw error; const users=data||[]; const ids=users.map((u:any)=>u.id);
 const [admins,beta,saved,booked,tickets,subs]=await Promise.all([
  safe(async()=>{const {data}=await supabaseAdmin.from("admin_users").select("user_id,role").in("user_id",ids);return data||[]},[] as any[]),
  safe(async()=>{const {data}=await supabaseAdmin.from("beta_testers").select("user_id,email,status").or(`user_id.in.(${ids.join(",")})`);return data||[]},[] as any[]),
  countBy("saved_plans",ids), countBy("user_outings",ids), countBy("support_tickets",ids,"user_id",(q:any)=>q.not("status","in","(closed,resolved)")),
  safe(async()=>{const {data}=await supabaseAdmin.from("customer_subscriptions").select("user_id,plan_key,status").in("user_id",ids).eq("status","active");return data||[]},[] as any[])
 ]);
 return {users:users.map((u:any)=>decorate(u,{admins,beta,saved,booked,tickets,subs})).filter((u:any)=>filterDecorated(u,filters)), count:count||0, page, per, hasMore:(count||0)>from+per};
}
function filterDecorated(u:any,f:any){if(f.beta&&f.beta!=="all"&&String(Boolean(u.beta_status)).slice(0)!==f.beta)return false; if(f.plan&&f.plan!=="all"&&u.plan!==f.plan)return false; if(f.tickets==="yes"&&u.open_tickets_count<1)return false; if(f.booked==="yes"&&u.booked_outings_count<1)return false; return true}
function decorate(u:any,x:any){const admin=x.admins.find((a:any)=>a.user_id===u.id); const b=x.beta.find((a:any)=>a.user_id===u.id||a.email===u.email); const sub=x.subs.find((a:any)=>a.user_id===u.id); return {...u, role:admin?.role||u.role||"user", beta_status:b?.status||null, plan:sub?.plan_key||u.plan||"free", saved_outings_count:x.saved[u.id]||0, booked_outings_count:x.booked[u.id]||0, open_tickets_count:x.tickets[u.id]||0, account_status:u.account_status||"active"}}
async function countBy(table:string,ids:string[],col="user_id",mut?:(q:any)=>any){if(!ids.length)return{};return safe(async()=>{let q=supabaseAdmin.from(table).select(col).in(col,ids); if(mut)q=mut(q); const {data}=await q; return (data||[]).reduce((a:any,r:any)=>(a[r[col]]=(a[r[col]]||0)+1,a),{})},{} as Record<string,number>)}
export async function getAdminUserDetail(userId:string){await requireAdminOrSupport(); const {data:profile}=await supabaseAdmin.from("user_profiles").select("*").eq("id",userId).maybeSingle(); const auth=await safe(async()=> (await supabaseAdmin.auth.admin.getUserById(userId)).data.user,null as any); const email=profile?.email||auth?.email||null; const [admin,beta,saved,booked,res,tickets,usage,sub]=await Promise.all([safe(async()=>{const {data}=await supabaseAdmin.from("admin_users").select("role").eq("user_id",userId).maybeSingle();return data},null as any),safe(async()=>{const {data}=await supabaseAdmin.from("beta_testers").select("*").or(`user_id.eq.${userId}${email?`,email.eq.${email}`:""}`).maybeSingle();return data},null as any),listRows("saved_plans",userId),listRows("user_outings",userId),listRows("location_reservations",userId),listTickets(userId,email),listRows("search_usage_events",userId,"auth_user_id"),safe(async()=>{const {data}=await supabaseAdmin.from("customer_subscriptions").select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(1).maybeSingle();return data},null as any)]); return {profile:{...(profile||{}),id:userId,email,role:admin?.role||profile?.role||"user",plan:sub?.plan_key||profile?.plan||"free",email_confirmed_at:auth?.email_confirmed_at,created_at:profile?.created_at||auth?.created_at,account_status:profile?.account_status||"active"}, beta,saved,booked,reservations:res,tickets,usage,subscription:sub};}
async function listRows(table:string,userId:string,col="user_id"){return safe(async()=>{const {data}=await supabaseAdmin.from(table).select("*").eq(col,userId).order("created_at",{ascending:false}).limit(50);return data||[]},[] as any[])}
export async function listTickets(userId:string,email?:string|null){return safe(async()=>{let q=supabaseAdmin.from("support_tickets").select("*").or(`user_id.eq.${userId}${email?`,requester_email.eq.${email},email.eq.${email}`:""}`).order("updated_at",{ascending:false}).limit(50); const {data}=await q;return data||[]},[] as any[])}
export async function updateAdminUserProfile(userId:string,input:any){const safeFields=["full_name","preferred_name","phone","mobile_number","zip_code","sms_opt_in","age_range","birthday_month","birthday_day","birthday_opt_in"]; const row:any={updated_at:new Date().toISOString()}; for(const k of safeFields) if(k in input) row[k]=input[k]||null; const {data,error}=await supabaseAdmin.from("user_profiles").upsert({id:userId,...row},{onConflict:"id"}).select("*").single(); if(error) throw error; return data}
export async function sendUserPasswordReset(email:string){const authClient=createSupabaseClient(requireSupabaseUrl(),requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),{auth:{persistSession:false,autoRefreshToken:false}}); const redirectTo=`${getSiteUrl().replace(/\/$/,"")}/reset-password`; const {error}=await authClient.auth.resetPasswordForEmail(email,{redirectTo}); if(error) throw error;}
