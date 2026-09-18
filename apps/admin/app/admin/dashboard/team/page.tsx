import Link from "next/link";

import { getCurrentAdmin } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import TeamWorkSessionClient from "@/components/TeamWorkSessionClient";
import {
  ensureTeamProfileForCurrentAdmin,
  getActiveSession,
  getAllowedWorkTypesForUser,
} from "@/lib/team-workspace";

export const dynamic = "force-dynamic";

async function count(table: string, filters: Record<string, string> = {}) {
  let query = getAdminDatabaseClient().from(table).select("id", { count: "exact", head: true });
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { count } = await query;
  return count || 0;
}

function Card({ label, value }: { label: string; value: number }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">{label}</p><p className="mt-2 text-4xl font-black">{value}</p></div>;
}

const TEAM_MANAGEMENT = new Set(["superadmin", "admin", "manager"]);
const TEAM_SECURITY = new Set(["superadmin", "admin"]);

export default async function AdminTeamPage() {
  const admin = await getCurrentAdmin();
  const db = getAdminDatabaseClient();
  const [
    members,
    activeSessions,
    pendingSessions,
    verifiedVisits,
    socialSent,
    answered,
    complete,
    resolved,
    payrollPending,
  ] = await Promise.all([
    count("team_member_profiles", { status: "active" }),
    count("team_work_sessions", { status: "active" }),
    count("team_work_sessions", { approval_status: "pending_review" }),
    count("ambassador_site_visits", { location_verification_status: "verified" }),
    count("ambassador_social_outreach", { message_status: "sent" }),
    count("team_work_activities", { ticket_action: "answered" }),
    count("team_work_activities", { ticket_action: "marked_complete" }),
    count("team_work_activities", { ticket_action: "resolved" }),
    count("team_work_sessions", { approval_status: "approved" }),
  ]);

  const links = [
    ["Members", "members", true],
    ["Assign Locations", "assignments", true],
    ["Work Sessions", "work-sessions", TEAM_MANAGEMENT.has(admin.role)],
    ["Manager Review", "review", TEAM_MANAGEMENT.has(admin.role)],
    ["Site Visits", "site-visits", TEAM_MANAGEMENT.has(admin.role)],
    ["Social Outreach", "social-outreach", TEAM_MANAGEMENT.has(admin.role)],
    ["Support Work", "support-work", true],
    ["Location Change Requests", "location-change-requests", TEAM_MANAGEMENT.has(admin.role)],
    ["Claim Code Audit", "claim-code-audit", TEAM_SECURITY.has(admin.role)],
    ["Password Reset Audit", "password-reset-audit", TEAM_SECURITY.has(admin.role)],
    ["Payroll", "payroll", TEAM_SECURITY.has(admin.role)],
    ["Performance", "performance", TEAM_MANAGEMENT.has(admin.role)],
    ["Proof Review", "proof-review", TEAM_MANAGEMENT.has(admin.role)],
    ["Settings", "settings", TEAM_MANAGEMENT.has(admin.role)],
  ] as const;

  let workspace: null | { profile: any; allowed: string[]; active: any; recent: any[] } = null;
  try {
    const { profile } = await ensureTeamProfileForCurrentAdmin();
    const [allowed, active, recent] = await Promise.all([
      getAllowedWorkTypesForUser(admin.user_id, profile),
      getActiveSession(admin.user_id),
      db.from("team_work_sessions").select("*").eq("user_id", admin.user_id).order("clock_in_at", { ascending: false }).limit(5),
    ]);
    workspace = { profile, allowed, active, recent: recent.data || [] };
  } catch {
    workspace = null;
  }

  return <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">Admin Dashboard / Team Tools</p>
          <h1 className="mt-2 text-4xl font-black">Team Tools</h1>
        </div>
        <Link href="/admin/dashboard/crm/work-queue?view=my-queue" className="rounded-full bg-white px-5 py-3 text-sm font-black text-black">Open CRM Work Queue</Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card label="Active team members" value={members} />
        <Card label="Active work sessions" value={activeSessions} />
        <Card label="Pending approvals" value={pendingSessions} />
        <Card label="Verified site visits" value={verifiedVisits} />
        <Card label="Social outreach sent" value={socialSent} />
        <Card label="Support tickets answered" value={answered} />
        <Card label="Support tickets marked complete" value={complete} />
        <Card label="Support tickets resolved" value={resolved} />
        <Card label="Payroll sessions pending export" value={payrollPending} />
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.filter(([, , visible]) => visible).map(([label, path]) => (
          <Link key={path} href={`/admin/dashboard/team/${path}`} className="rounded-3xl border border-white/10 bg-[#111] p-5 font-black hover:bg-white/[0.08]">{label} →</Link>
        ))}
      </div>

      {workspace ? <section className="mt-10 rounded-[2rem] border border-rose-400/20 bg-rose-500/10 p-5 sm:p-7">
        <div className="mb-5">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">CRM Work Queue</p>
          <h2 className="mt-2 text-2xl font-black">CRM work queue actions</h2>
        </div>
        <TeamWorkSessionClient profile={workspace.profile} allowedWorkTypes={workspace.allowed} activeSession={workspace.active} recentSessions={workspace.recent} />
      </section> : null}
    </div>
  </main>;
}
