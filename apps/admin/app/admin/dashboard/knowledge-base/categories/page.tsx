import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getKbCategories } from "@/lib/knowledge-base/server";
import KbTabs from "../KbTabs";
import CategoriesClient from "./CategoriesClient";
import { AdminKpiCard, AdminKpiGrid, AdminPageHeader, AdminPageShell, AdminStatusBadge } from "../../../../../components/admin/AdminDesignSystem";

export default async function Page() {
  await requireAdminRole(["superadmin","admin"]);
  const categories = await getKbCategories();
  return (
    <AdminPageShell>
      <AdminPageHeader eyebrow="Knowledge Base · Governance" title="Knowledge Base Categories" subtitle="Manage the taxonomy used to organize and govern internal knowledge." badge={<AdminStatusBadge tone="blue">{categories.length} categories</AdminStatusBadge>} />
      <AdminKpiGrid><AdminKpiCard label="Categories" value={categories.length} helper="Knowledge taxonomy" /></AdminKpiGrid>
      <KbTabs />
      <CategoriesClient categories={categories} />
    </AdminPageShell>
  );
}
