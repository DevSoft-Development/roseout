import { WorkspaceListPage } from "@/components/WorkspaceListPage";
import { ensureTeamProfileForCurrentUser } from "@/lib/team-tools";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { RowActionButton } from "@/components/TeamToolsForms";
export const dynamic="force-dynamic";
export default async function FollowUps(){ const {user}=await ensureTeamProfileForCurrentUser(); const {data=[]}=await supabaseAdmin.from("team_follow_ups").select("*").eq("user_id",user.id).order("follow_up_at",{ascending:true}).limit(100); return <WorkspaceListPage title="Follow-Ups" backHref="/my-workspace" description="Due today, overdue, this week, site visit, social outreach, ticket, claim-code, and owner follow-ups tied to real workspace records." rows={data||[]} empty="No follow-ups are due." >{(data||[]).length?<div className="mt-4 rounded-3xl border border-white/10 bg-[#111] p-4 text-sm font-bold text-white/55">Use the row actions to complete or escalate from the connected API.</div>:null}</WorkspaceListPage> }
