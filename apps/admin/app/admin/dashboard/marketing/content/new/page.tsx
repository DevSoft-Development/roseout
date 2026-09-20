import MarketingContentEditor from "@/components/marketing/MarketingContentEditor";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function NewMarketingContentPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketingEdit);
  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Marketing · Content"
        title="Create Content"
        subtitle="Build one master content item from a location, outing, event, experience, or offer. It cannot publish until its current version is approved."
        badge={<AdminStatusBadge tone="amber">Approval required before publish</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/marketing/content">Content Pipeline</AdminActionButton>}
      />
      <MarketingContentEditor />
    </AdminPageShell>
  );
}
