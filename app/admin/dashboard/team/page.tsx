import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import TeamWorkSessionClient from "@/components/TeamWorkSessionClient";
import {
  getActiveSession,
  getAllowedWorkTypesForUser,
  getTeamProfileForUser,
} from "@/lib/team-tools";

export const dynamic = "force-dynamic";

async function count(table: string, filters: Record<string, string> = {}) {
  let q = supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { count } = await q;
  return count || 0;
}
function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
        {label}
      </p>
      <p className="mt-2 text-4xl font-black">{value}</p>
    </div>
  );
}
function Action({
  label,
  href,
  enabled,
  explanation,
}: {
  label: string;
  href: string;
  enabled: boolean;
  explanation: string;
}) {
  return enabled ? (
    <Link
      href={href}
      className="rounded-3xl border border-white/10 bg-[#111] p-5 font-black hover:bg-white/[0.08]"
    >
      {label} →
    </Link>
  ) : (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 opacity-70">
      <p className="font-black text-white/70">{label}</p>
      <p className="mt-2 text-sm font-bold text-white/45">{explanation}</p>
    </div>
  );
}

export default async function AdminTeamPage() {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);
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
    profile,
  ] = await Promise.all([
    count("team_member_profiles", { status: "active" }),
    count("team_work_sessions", { status: "active" }),
    count("team_work_sessions", { approval_status: "pending_review" }),
    count("ambassador_site_visits", {
      location_verification_status: "verified",
    }),
    count("ambassador_social_outreach", { message_status: "sent" }),
    count("team_work_activities", { ticket_action: "answered" }),
    count("team_work_activities", { ticket_action: "marked_complete" }),
    count("team_work_activities", { ticket_action: "resolved" }),
    count("team_work_sessions", { approval_status: "approved" }),
    getTeamProfileForUser(admin.user_id),
  ]);
  const links = [
    ["Overview", ""],
    ["Members", "members"],
    ["Assign Locations", "assignments"],
    ["Work Sessions", "work-sessions"],
    ["Manager Review", "review"],
    ["Site Visits", "site-visits"],
    ["Social Outreach", "social-outreach"],
    ["Support Work", "support-work"],
    ["Location Change Requests", "location-change-requests"],
    ["Claim Code Audit", "claim-code-audit"],
    ["Password Reset Audit", "password-reset-audit"],
    ["Payroll", "payroll"],
    ["Performance", "performance"],
    ["Proof Review", "proof-review"],
    ["Settings", "settings"],
  ];
  const workspaceData = profile
    ? await Promise.all([
        getAllowedWorkTypesForUser(admin.user_id, profile),
        getActiveSession(admin.user_id),
        supabaseAdmin
          .from("team_work_sessions")
          .select("*")
          .eq("user_id", admin.user_id)
          .order("clock_in_at", { ascending: false })
          .limit(5),
      ])
    : null;
  const workspaceActions = profile
    ? [
        {
          label: "My Site Visits",
          href: "/admin/dashboard/crm/site-visits",
          enabled: Boolean(profile.can_do_site_visits),
          explanation: "Your team profile does not allow site visit check-ins.",
        },
        {
          label: "My Social Outreach",
          href: "/admin/dashboard/crm/social-outreach",
          enabled: Boolean(profile.can_do_social_outreach),
          explanation: "Your team profile does not allow social outreach.",
        },
        {
          label: "My Support Work",
          href: "/admin/dashboard/crm/support",
          enabled: Boolean(profile.can_work_support_tickets),
          explanation: "Your team profile does not allow support work.",
        },
        {
          label: "My Demo / Training",
          href: "/admin/dashboard/crm/demo",
          enabled: Boolean(profile.can_use_demo_mode),
          explanation: "Your team profile does not allow demo/training mode.",
        },
        {
          label: "My Payroll",
          href: "/admin/dashboard/team/payroll",
          enabled: true,
          explanation:
            "Payroll history is available for every workspace profile.",
        },
      ]
    : [];
  return (
    <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">
              Admin Dashboard / Team Tools
            </p>
            <h1 className="mt-2 text-4xl font-black">Team Tools</h1>
          </div>
          <Link
            href="/admin/dashboard/crm/my-queue"
            className="rounded-full bg-white px-5 py-3 text-sm font-black text-black"
          >
            Open My Workspace
          </Link>
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
          <Card
            label="Payroll sessions pending export"
            value={payrollPending}
          />
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map(([label, path]) => (
            <Link
              key={path}
              href={path?.startsWith("../") ? `/admin/dashboard/${path.slice(3)}` : path ? `/admin/dashboard/team/${path}` : "/admin/dashboard/team"}
              className="rounded-3xl border border-white/10 bg-[#111] p-5 font-black hover:bg-white/[0.08]"
            >
              {label} →
            </Link>
          ))}
        </div>
        {profile && workspaceData ? (
          <section className="mt-10 rounded-[2rem] border border-rose-400/20 bg-rose-500/10 p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">
                  My Workspace
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  My Workspace actions
                </h2>
                <p className="mt-2 text-sm font-bold text-white/55">
                  Admins with an active team member profile can clock in/out
                  here without changing their login landing page.
                </p>
              </div>
              <Link
                href="/admin/dashboard/crm/my-queue"
                className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-xs font-black text-white"
              >
                Open My Workspace
              </Link>
            </div>
            <TeamWorkSessionClient
              profile={profile}
              allowedWorkTypes={workspaceData[0]}
              activeSession={workspaceData[1]}
              recentSessions={workspaceData[2].data || []}
            />
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {workspaceActions.map((action) => (
                <Action key={action.href} {...action} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
