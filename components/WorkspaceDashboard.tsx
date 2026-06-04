import Link from "next/link";
import TeamWorkSessionClient from "@/components/TeamWorkSessionClient";
import { labelize } from "@/lib/team-tools";

type WorkspaceAction = {
  label: string;
  href: string;
  enabled: boolean;
  description: string;
  cta?: string;
  explanation: string;
};

type WorkspaceMetric = {
  label: string;
  value: string | number;
  href?: string;
};

function ActionCard({ action }: { action: WorkspaceAction }) {
  const className = "rounded-3xl border p-5 transition";
  if (action.enabled) {
    return (
      <Link href={action.href} className={`${className} border-white/10 bg-[#111] hover:bg-white/[0.08]`}>
        <p className="text-lg font-black">{action.label}</p>
        <p className="mt-2 text-sm font-bold text-white/50">{action.description}</p>
        <p className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-black">{action.cta || "Open"}</p>
      </Link>
    );
  }

  return (
    <div className={`${className} border-white/10 bg-white/[0.04] opacity-75`} aria-disabled="true">
      <p className="text-lg font-black text-white/70">{action.label}</p>
      <p className="mt-2 text-sm font-bold text-white/45">{action.explanation}</p>
      <p className="mt-4 inline-flex rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/45">Permission required</p>
    </div>
  );
}

export function WorkspaceDashboard({
  title = "My Workspace",
  eyebrow = "My Work",
  description,
  profile,
  allowedWorkTypes,
  activeSession,
  recentSessions,
  actions,
  metrics,
  shell = "staff",
}: {
  title?: string;
  eyebrow?: string;
  description: string;
  profile: any;
  allowedWorkTypes: string[];
  activeSession: any | null;
  recentSessions: any[];
  actions: WorkspaceAction[];
  metrics: WorkspaceMetric[];
  shell?: "staff" | "admin";
}) {
  return (
    <main className={shell === "admin" ? "px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8" : "min-h-screen bg-[#080808] px-4 py-8 text-white sm:px-6 lg:px-8"}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">{eyebrow}</p>
            <h1 className="mt-2 text-4xl font-black">{title}</h1>
            <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/55">{description}</p>
            <p className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-white/35">{labelize(profile.team_type)} profile · server-validated work types</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.filter((action) => action.enabled).slice(0, 5).map((action) => (
              <Link key={action.href} href={action.href} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white/70 hover:bg-white/10">
                {action.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => {
            const body = <><p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">{metric.label}</p><p className="mt-2 text-3xl font-black">{metric.value}</p></>;
            return metric.href ? <Link key={metric.label} href={metric.href} className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 hover:bg-white/[0.09]">{body}</Link> : <div key={metric.label} className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">{body}</div>;
          })}
        </div>

        <TeamWorkSessionClient profile={profile} allowedWorkTypes={allowedWorkTypes} activeSession={activeSession} recentSessions={recentSessions} />

        <section className="mt-8">
          <h2 className="text-2xl font-black">Workspace tools</h2>
          <p className="mt-2 text-sm font-bold text-white/55">Cards stay visible when permission is disabled so team members know what to request from a manager. All actions are enforced again on the server.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {actions.map((action) => <ActionCard key={action.href} action={action} />)}
          </div>
        </section>
      </div>
    </main>
  );
}
