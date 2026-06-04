import { WorkspaceListPage } from "@/components/WorkspaceListPage";
import { ensureTeamProfileForCurrentUser } from "@/lib/team-tools";
import { supabaseAdmin } from "@/lib/supabase-admin";
export const dynamic="force-dynamic";
export default async function Notifications(){ const {user}=await ensureTeamProfileForCurrentUser(); const {data=[]}=await supabaseAdmin.from("workspace_notifications").select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(100); return <WorkspaceListPage title="Notifications" backHref="/my-workspace" description="Task, follow-up, ticket, claim-code, correction, payroll, site visit, training, and change-request notifications from Supabase." rows={data||[]} empty="No notifications yet."/> }
