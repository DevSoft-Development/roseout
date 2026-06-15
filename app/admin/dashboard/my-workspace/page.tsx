import { WorkspaceDashboard } from "@/components/WorkspaceDashboard";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTeamProfileForUser } from "@/lib/team-tools";
import { loadWorkspaceDashboardData, workspaceActions } from "@/lib/workspace-dashboard-data";
import { CreateSuperadminTeamProfileButton } from "@/components/TeamToolsForms";

export const dynamic = "force-dynamic";

export default async function AdminMyWorkspacePage() {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);
  if (!["superadmin", "admin", "manager"].includes(admin.role)) {
    return <main className="px-4 py-10 text-white"><div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-[#111] p-8"><h1 className="text-3xl font-black">Admin Workspace Access</h1><p className="mt-3 text-sm font-bold text-white/55">Ambassador and Experience Team roles use the staff-facing workspace unless they also have admin or manager access.</p></div></main>;
  }

  const profile = await getTeamProfileForUser(admin.user_id);
  if (!profile) {
    return (
      <main className="px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-rose-400/20 bg-rose-500/10 p-8">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-200">Admin Dashboard / My Workspace</p>
          <h1 className="mt-3 text-3xl font-black">You have admin access, but you do not have a team profile yet.</h1>
          <p className="mt-3 text-sm font-bold leading-6 text-white/60">Create one to use workspace actions. This keeps your superadmin/admin login and adds a workspace profile for audited clock-in, site visit, social outreach, support, claim-code, password-reset, demo, and review actions.</p>
          <div className="mt-6"><CreateSuperadminTeamProfileButton /></div>
        </div>
      </main>
    );
  }

  const data = await loadWorkspaceDashboardData(admin.user_id, profile);
  const adminActions = [
    ...(["superadmin", "admin"].includes(admin.role) ? [{ label: "Assign Locations", href: "/admin/dashboard/my-workspace/assign-locations", enabled: true, description: "Add locations to your queue or assign them by neighborhood, category, or status.", cta: "Assign Locations", explanation: "Admin access is required." }] : []),
    ...workspaceActions(profile, "/admin/dashboard/my-workspace"),
  ];
  const metrics = data.metrics.map((metric) => metric.href ? { ...metric, href: metric.href.replace("/my-workspace", "/admin/dashboard/my-workspace") } : metric);

  return (
    <WorkspaceDashboard
      title="Partner Launch Dashboard"
      eyebrow="Admin Dashboard / My Workspace"
      description="Partner Sales Today: work Partner Launch locations, claim invitations, follow-ups, reservation setup, website embeds, discovery readiness, and active partner onboarding inside the admin dashboard shell."
      profile={profile}
      allowedWorkTypes={data.allowedWorkTypes}
      activeSession={data.activeSession}
      recentSessions={data.recentSessions}
      actions={adminActions}
      metrics={metrics}
      shell="admin"
    />
  );
}
