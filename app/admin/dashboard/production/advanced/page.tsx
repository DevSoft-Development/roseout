import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import ProductionCommandCenterClient from "../ProductionCommandCenterClient";

export const metadata = { title: "Advanced Production Finish Line – Admin" };

export default async function AdvancedProductionPage() {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.productionFinishLine);
  return <ProductionCommandCenterClient adminName={admin.full_name || admin.email || "Admin"} adminRole={admin.role} />;
}
