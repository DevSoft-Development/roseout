import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import ProductionReadinessSimpleClient from "./ProductionReadinessSimpleClient";

export const metadata = { title: "Production Readiness – Admin" };

export default async function ProductionPage() {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.productionFinishLine);
  return <ProductionReadinessSimpleClient adminName={admin.full_name || admin.email || "Admin"} adminRole={admin.role} />;
}
