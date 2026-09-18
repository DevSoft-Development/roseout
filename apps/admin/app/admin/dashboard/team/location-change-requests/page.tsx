import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { TeamReviewList } from "@/components/TeamReviewList";

export const dynamic = "force-dynamic";

export default async function LocationChangeRequestsPage() {
  await requireAdminRole(["superadmin", "admin", "manager"]);

  const { data = [] } = await getAdminDatabaseClient()
    .from("location_change_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <TeamReviewList
      title="Location Change Requests"
      description="Protected workspace CRM field changes. Approving stores manager review status and audit logs; protected fields cannot be edited directly by team members."
      rows={data || []}
      table="location_change_requests"
    />
  );
}
