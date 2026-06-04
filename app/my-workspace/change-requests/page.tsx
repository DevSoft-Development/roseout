import { WorkspaceListPage } from "@/components/WorkspaceListPage";
import { ensureTeamProfileForCurrentUser } from "@/lib/team-tools";
import { supabaseAdmin } from "@/lib/supabase-admin";
export const dynamic="force-dynamic";
export default async function ChangeRequests(){ const {user}=await ensureTeamProfileForCurrentUser(); const {data=[]}=await supabaseAdmin.from("location_change_requests").select("*").eq("requested_by_user_id",user.id).order("created_at",{ascending:false}).limit(100); return <WorkspaceListPage title="Change Requests" backHref="/my-workspace" description="Protected location field changes requested through the limited workspace CRM and reviewed by managers." rows={data||[]} empty="No protected field change requests yet."/> }
