import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { TeamReviewList } from "@/components/TeamReviewList";

export const dynamic = "force-dynamic";

export default async function ClaimCodeAuditPage() {
  await requireAdminRole(["superadmin", "admin"]);

  const { data = [] } = await getAdminDatabaseClient()
    .from("claim_code_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <TeamReviewList
      title="Claim Code Audit"
      description="Audited claim-code sends and logged deliveries by workspace users, with channels, platforms, masked targets, and rate-limit metadata."
      rows={data || []}
      table="claim_code_audit_logs"
    />
  );
}
