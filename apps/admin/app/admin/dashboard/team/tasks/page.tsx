import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { WorkspaceListPage } from "@/components/WorkspaceListPage";

export const dynamic = "force-dynamic";

export default async function TeamTasksPage() {
  await requireAdminRole(["superadmin", "admin", "manager"]);

  const { data = [] } = await getAdminDatabaseClient()
    .from("workspace_tasks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <WorkspaceListPage
      title="Team Tasks"
      backHref="/admin/dashboard/team"
      description="Admin view of workspace task assignments connected to Supabase workspace_tasks."
      rows={data || []}
      empty="No team tasks yet."
    />
  );
}
