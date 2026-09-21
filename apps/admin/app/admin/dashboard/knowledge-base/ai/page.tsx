import { requireAdminRole } from "@theouthaven/auth/admin-session";
import KbTabs from "../KbTabs";
import AiClient from "./AiClient";
import { AdminPageHeader, AdminPageShell, AdminStatusBadge } from "../../../../../components/admin/AdminDesignSystem";

export default async function Page() {
  await requireAdminRole(["superadmin","admin","editor","reviewer","ambassador","experience_team","partner_ambassador","marketing_intern","marketing_specialist","marketing_manager","viewer"]);
  return (
    <AdminPageShell>
      <AdminPageHeader eyebrow="Knowledge Base · AI" title="Knowledge Base AI" subtitle="Ask questions grounded only in published, AI-approved Knowledge Base articles you are allowed to view." badge={<AdminStatusBadge tone="green">Grounded answers only</AdminStatusBadge>} />
      <KbTabs />
      <AiClient />
    </AdminPageShell>
  );
}
