import Link from "next/link";
import TeamWorkSessionClient from "@/components/TeamWorkSessionClient";
import { ensureTeamProfileForCurrentUser, getActiveSession, getAllowedWorkTypesForUser, supabaseAdmin } from "@/lib/team-tools-page";

export const dynamic = "force-dynamic";

type WorkspaceAction = {
  label: string;
  href: string;
  enabled: boolean;
  description: string;
  cta: string;
  explanation: string;
};

function ActionCard({ action }: { action: WorkspaceAction }) {
  const className = "rounded-3xl border p-5 transition";
  if (action.enabled) {
    return (
      <Link href={action.href} className={`${className} border-white/10 bg-[#111] hover:bg-white/[0.08]`}>
        <p className="text-lg font-black">{action.label}</p>
        <p className="mt-2 text-sm font-bold text-white/50">{action.description}</p>
        <p className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-black">{action.cta}</p>
      </Link>
    );
  }

  return (
    <div className={`${className} border-white/10 bg-white/[0.04] opacity-70`} aria-disabled="true">
      <p className="text-lg font-black text-white/70">{action.label}</p>
      <p className="mt-2 text-sm font-bold text-white/45">{action.explanation}</p>
      <p className="mt-4 inline-flex rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/45">Permission required</p>
    </div>
  );
}

export default async function MyWorkspacePage() {
  const { user, profile } = await ensureTeamProfileForCurrentUser();
  const [allowedWorkTypes, activeSession, recent] = await Promise.all([
    getAllowedWorkTypesForUser(user.id, profile),
    getActiveSession(user.id),
    supabaseAdmin.from("team_work_sessions").select("*").eq("user_id", user.id).order("clock_in_at", { ascending: false }).limit(8),
  ]);

  const actions: WorkspaceAction[] = [
    {
      label: "My Site Visits",
      href: "/my-workspace/site-visits",
      enabled: Boolean(profile.can_do_site_visits),
      description: "Start Site Visit for assigned or permitted locations, including internal-only location creation from the visit flow.",
      cta: "Start Site Visit",
      explanation: "Your team profile does not currently allow site visit check-ins.",
    },
    {
      label: "My Social Outreach",
      href: "/my-workspace/social-outreach",
      enabled: Boolean(profile.can_do_social_outreach),
      description: "Log outreach, follow-ups, proof uploads, and notes for assigned or permitted locations.",
      cta: "Open My Social Outreach",
      explanation: "Your team profile does not currently allow social outreach work.",
    },
    {
      label: "My Support Work",
      href: "/my-workspace/support-work",
      enabled: Boolean(profile.can_work_support_tickets),
      description: "Work assigned support tickets from the existing ticket system without opening unrestricted admin CRM.",
      cta: "Open My Support Work",
      explanation: "Your team profile does not currently allow support ticket work.",
    },
    {
      label: "My Demo / Training",
      href: "/my-workspace/demo",
      enabled: Boolean(profile.can_use_demo_mode),
      description: "Practice with demo sessions and training-only location copies.",
      cta: "Open My Demo / Training",
      explanation: "Your team profile does not currently allow demo or training mode.",
    },
    {
      label: "My Payroll",
      href: "/my-workspace/payroll",
      enabled: true,
      description: "Review your own work sessions, approval status, and exported payroll history.",
      cta: "Open My Payroll",
      explanation: "Payroll history is available for every workspace profile.",
    },
  ];

  return (
    <main className="min-h-screen bg-[#080808] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">My Work</p>
            <h1 className="mt-2 text-4xl font-black">My Workspace</h1>
            <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-white/55">
              Clock in, choose your allowed work type, and access your permitted work actions without unrestricted admin CRM access.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.filter((action) => action.enabled).map((action) => (
              <Link key={action.href} href={action.href} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white/70 hover:bg-white/10">
                {action.label}
              </Link>
            ))}
          </div>
        </div>

        <TeamWorkSessionClient profile={profile} allowedWorkTypes={allowedWorkTypes} activeSession={activeSession} recentSessions={recent.data || []} />

        <section className="mt-8">
          <h2 className="text-2xl font-black">My Work</h2>
          <p className="mt-2 text-sm font-bold text-white/55">Available actions are based on your team member profile permissions. Restricted actions stay visible with an explanation.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {actions.map((action) => <ActionCard key={action.href} action={action} />)}
          </div>
        </section>
      </div>
    </main>
  );
}
