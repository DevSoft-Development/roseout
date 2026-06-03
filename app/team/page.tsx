import Link from "next/link";
import TeamWorkSessionClient from "@/components/TeamWorkSessionClient";
import { ensureTeamProfileForCurrentUser, getActiveSession, getAllowedWorkTypesForUser, supabaseAdmin } from "@/lib/team-tools-page";

export const dynamic = "force-dynamic";

export default async function TeamHomePage() {
  const { user, profile } = await ensureTeamProfileForCurrentUser();
  const [allowedWorkTypes, activeSession, recent] = await Promise.all([
    getAllowedWorkTypesForUser(user.id, profile),
    getActiveSession(user.id),
    supabaseAdmin.from("team_work_sessions").select("*").eq("user_id", user.id).order("clock_in_at", { ascending: false }).limit(8),
  ]);
  const links = [
    ["Site Visits", "/team/site-visits", profile.can_do_site_visits],
    ["Social Outreach", "/team/social-outreach", profile.can_do_social_outreach],
    ["Support Work", "/team/support-work", profile.can_work_support_tickets],
    ["Demo / Training", "/team/demo", profile.can_use_demo_mode],
    ["My Payroll", "/team/payroll", true],
  ];
  return <main className="min-h-screen bg-[#080808] px-4 py-8 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">Team Tools</p><h1 className="mt-2 text-4xl font-black">My Team Workspace</h1></div><div className="flex flex-wrap gap-2">{links.filter(([, , ok]) => ok).map(([label, href]) => <Link key={String(href)} href={String(href)} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white/70 hover:bg-white/10">{label}</Link>)}</div></div>
    <TeamWorkSessionClient profile={profile} allowedWorkTypes={allowedWorkTypes} activeSession={activeSession} recentSessions={recent.data || []} />
  </div></main>;
}
