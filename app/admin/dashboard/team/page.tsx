import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

async function count(table: string, filters: Record<string, string> = {}) { let q = supabaseAdmin.from(table).select("id", { count: "exact", head: true }); for (const [k,v] of Object.entries(filters)) q = q.eq(k,v); const { count } = await q; return count || 0; }
function Card({ label, value }: { label: string; value: number }) { return <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">{label}</p><p className="mt-2 text-4xl font-black">{value}</p></div>; }

export default async function AdminTeamPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);
  const [members, activeSessions, pendingSessions, verifiedVisits, socialSent, answered, complete, resolved, payrollPending] = await Promise.all([
    count("team_member_profiles", { status: "active" }), count("team_work_sessions", { status: "active" }), count("team_work_sessions", { approval_status: "pending_review" }), count("ambassador_site_visits", { location_verification_status: "verified" }), count("ambassador_social_outreach", { message_status: "sent" }), count("team_work_activities", { ticket_action: "answered" }), count("team_work_activities", { ticket_action: "marked_complete" }), count("team_work_activities", { ticket_action: "resolved" }), count("team_work_sessions", { approval_status: "approved" }),
  ]);
  const links = [["Team Members","members"],["Work Sessions","work-sessions"],["Site Visit Check-Ins","site-visits"],["Social Outreach","social-outreach"],["Support Work","support-work"],["Demo / Training Mode","demo"],["Payroll Export","payroll"],["Performance","performance"],["Proof Review","proof-review"]];
  return <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">Admin Dashboard / Team Tools</p><h1 className="mt-2 text-4xl font-black">Team Tools</h1><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Card label="Active team members" value={members}/><Card label="Active work sessions" value={activeSessions}/><Card label="Pending approvals" value={pendingSessions}/><Card label="Verified site visits" value={verifiedVisits}/><Card label="Social outreach sent" value={socialSent}/><Card label="Support tickets answered" value={answered}/><Card label="Support tickets marked complete" value={complete}/><Card label="Support tickets resolved" value={resolved}/><Card label="Payroll sessions pending export" value={payrollPending}/></div><div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{links.map(([label,path]) => <Link key={path} href={`/admin/dashboard/team/${path}`} className="rounded-3xl border border-white/10 bg-[#111] p-5 font-black hover:bg-white/[0.08]">{label} →</Link>)}</div></div></main>;
}
