import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { CRM_LOCATION_HEALTH_READ_ROLES } from "@/lib/crm/location-health-permissions";
import LocationHealthClient from "./LocationHealthClient";
import DuplicateReviewSection from "./DuplicateReviewSection";

export const dynamic = "force-dynamic";

export default async function LocationHealthPage() {
  await requireAdminRole(CRM_LOCATION_HEALTH_READ_ROLES);
  return (
    <CrmWorkspaceShell>
      <LocationHealthClient />
      <DuplicateReviewSection />
    </CrmWorkspaceShell>
  );
}
