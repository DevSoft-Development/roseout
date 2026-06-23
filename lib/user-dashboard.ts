import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type DashboardUserContext = Awaited<ReturnType<typeof getCurrentUserDashboardContext>>;

async function maybeSingle(table:string, select="*", col="id", value?:string|null){
  if(!value) return null;
  try { const {data}=await supabaseAdmin.from(table).select(select).eq(col,value).maybeSingle(); return data; } catch { return null; }
}
async function list(table:string, userId:string, limit=20){
  try { const {data}=await supabaseAdmin.from(table).select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(limit); return data||[]; } catch { return []; }
}
export async function requireUserForDashboard(next="/user/dashboard",loginPath="/login"){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect(`${loginPath}?next=${encodeURIComponent(next)}`);
  return user;
}
export async function getUserProfileForDashboard(userId:string){
  const [profile, legacy]=await Promise.all([
    maybeSingle("user_profiles","*","id",userId),
    maybeSingle("users","*","id",userId),
  ]);
  return {profile, legacy, merged:{...((legacy as any)||{}),...((profile as any)||{})}};
}
export async function getUserBetaStatus(userId:string,email?:string|null){
  try {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const byUser = await supabaseAdmin.from("beta_testers").select("*").eq("user_id", userId).in("status",["active","approved"]).maybeSingle();
    if (byUser.data) return byUser.data;
    if (!normalizedEmail) return null;
    const byEmail = await supabaseAdmin.from("beta_testers").select("*").eq("email", normalizedEmail).in("status",["active","approved"]).maybeSingle();
    if (byEmail.data) {
      if (!byEmail.data.user_id) {
        await supabaseAdmin.from("beta_testers").update({ user_id: userId }).eq("id", byEmail.data.id);
        await supabaseAdmin.from("admin_audit_logs").insert({ action: "beta_user_linked", entity_type: "beta_tester", entity_id: byEmail.data.id, target_email: normalizedEmail, target_user_id: userId, summary: "Beta tester user_id auto-linked from dashboard email match", metadata: { source: "getUserBetaStatus" } });
        return { ...byEmail.data, user_id: userId };
      }
      return byEmail.data;
    }
    return null;
  } catch { return null; }
}
export async function getUserSavedOutings(userId:string,limit=12){ return list("saved_plans",userId,limit); }
export async function getUserBookedOutings(userId:string,limit=12){ return list("user_outings",userId,limit); }
export async function getUserInternalReservations(userId:string,limit=5){
  try { const {data}=await supabaseAdmin.from("location_reservations").select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(limit); return data||[]; } catch { return []; }
}
export async function getUserSearchPlan(userId:string,beta:boolean){
  if(beta) return {planKey:"beta",label:"Beta Tester",unlimited:true};
  const sub=await maybeSingle("customer_subscriptions","*","user_id",userId);
  const key=(sub as any)?.plan_key || "free";
  return {planKey:key,label:key==="unlimited"?"TheOutHaven Plus":"Free Account",unlimited:["unlimited","comped","admin"].includes(key)};
}
export async function getUserWeeklyUsage(userId:string){
  const since=new Date(); since.setUTCDate(since.getUTCDate()-7);
  try { const {count}=await supabaseAdmin.from("search_usage_events").select("id",{count:"exact",head:true}).eq("auth_user_id",userId).eq("allowed",true).gte("created_at",since.toISOString()); return count||0; } catch { return 0; }
}
export async function getCurrentUserDashboardContext(){
  const user=await requireUserForDashboard();
  const [profiles,saved,booked,reservations,beta]=await Promise.all([
    getUserProfileForDashboard(user.id), getUserSavedOutings(user.id,6), getUserBookedOutings(user.id,6), getUserInternalReservations(user.id,5), getUserBetaStatus(user.id,user.email)
  ]);
  const [plan, weeklyUsage]=await Promise.all([getUserSearchPlan(user.id,Boolean(beta)),getUserWeeklyUsage(user.id)]);
  return {user, profile:profiles.merged, userProfile:profiles.profile, usersRow:profiles.legacy, savedOutings:saved, bookedOutings:booked, reservations, beta, isBeta:Boolean(beta), plan, weeklyUsage};
}

export async function getCurrentBetaUserDashboardContext(){
  const user=await requireUserForDashboard("/user/dashboard/beta","/beta/login");
  const [profiles,saved,booked,reservations,beta]=await Promise.all([
    getUserProfileForDashboard(user.id), getUserSavedOutings(user.id,6), getUserBookedOutings(user.id,6), getUserInternalReservations(user.id,5), getUserBetaStatus(user.id,user.email)
  ]);
  const [plan, weeklyUsage]=await Promise.all([getUserSearchPlan(user.id,Boolean(beta)),getUserWeeklyUsage(user.id)]);
  return {user, profile:profiles.merged, userProfile:profiles.profile, usersRow:profiles.legacy, savedOutings:saved, bookedOutings:booked, reservations, beta, isBeta:Boolean(beta), plan, weeklyUsage};
}
