import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { TeamReviewList } from "@/components/TeamReviewList";

export const dynamic = "force-dynamic";

export default async function TeamEscalationsPage() {
  await requireAdminRole(["superadmin", "admin", "manager"]);

  const { data = [] } = await getAdminDatabaseClient()
    .from("workspace_escalations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <TeamReviewList
      title="Escalations"
      description="Workspace escalations for owner anger, wrong business info, claim issues, reservations, billing, legal/privacy, repeated failed outreach, do-not-contact, and other risks."
      rows={data || []}
      table="workspace_escalations"
    />
  );
}
