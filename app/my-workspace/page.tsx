import { redirect } from "next/navigation";
import { WorkspaceDashboard } from "@/components/WorkspaceDashboard";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureTeamProfileForCurrentUser, getCurrentUser } from "@/lib/team-tools";
import { loadWorkspaceDashboardData, workspaceActions } from "@/lib/workspace-dashboard-data";

export const dynamic = "force-dynamic";

export default async function MyWorkspacePage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  const { data: adminUser } = await supabaseAdmin.from("admin_users").select("role").eq("user_id", currentUser.id).maybeSingle();
  if (["superadmin", "admin", "manager"].includes(String((adminUser as any)?.role || ""))) {
    redirect("/admin/dashboard/my-workspace");
  }

  const { user, profile } = await ensureTeamProfileForCurrentUser();
  const data = await loadWorkspaceDashboardData(user.id, profile);

  return (
    <WorkspaceDashboard
      title="My Workspace"
      eyebrow="My Work"
      description="Clock in, choose your allowed work type, and access your permitted CRM, site visit, outreach, support, claim-code, follow-up, payroll, notification, and training actions without unrestricted admin CRM access."
      profile={profile}
      allowedWorkTypes={data.allowedWorkTypes}
      activeSession={data.activeSession}
      recentSessions={data.recentSessions}
      actions={workspaceActions(profile)}
      metrics={data.metrics}
    />
  );
}
