import { WorkspaceListPage } from "@/components/WorkspaceListPage";
import { ensureTeamProfileForCurrentUser } from "@/lib/team-tools";
import { supabaseAdmin } from "@/lib/supabase-admin";
export const dynamic="force-dynamic";
export default async function Tasks(){ const {user}=await ensureTeamProfileForCurrentUser(); const {data=[]}=await supabaseAdmin.from("workspace_tasks").select("*").eq("assigned_to_user_id",user.id).order("due_at",{ascending:true}).limit(100); return <WorkspaceListPage title="My Tasks" backHref="/my-workspace" description="Assigned CRM, support, outreach, site visit, and follow-up work from Supabase workspace_tasks." rows={data||[]} empty="No assigned tasks. When managers assign work, it appears here."/> }
