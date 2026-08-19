import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import LocationHealthClient from "./LocationHealthClient";
import DuplicateReviewSection from "./DuplicateReviewSection";

export const dynamic = "force-dynamic";

export default async function LocationHealthPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  return (
    <CrmWorkspaceShell>
      <LocationHealthClient />
      <DuplicateReviewSection />
    </CrmWorkspaceShell>
  );
}
