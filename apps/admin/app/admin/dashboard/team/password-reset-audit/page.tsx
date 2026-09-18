import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { TeamReviewList } from "@/components/TeamReviewList";

export const dynamic = "force-dynamic";

export default async function PasswordResetAuditPage() {
  await requireAdminRole(["superadmin", "admin"]);

  const { data = [] } = await getAdminDatabaseClient()
    .from("password_reset_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <TeamReviewList
      title="Password Reset Audit"
      description="Every owner password-reset assistance attempt is logged with masked target email, requester, reason, support context, and provider response."
      rows={data || []}
      table="password_reset_audit_logs"
    />
  );
}
