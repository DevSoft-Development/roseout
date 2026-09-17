import { requireAdminRole } from "@theouthaven/auth/admin-session";
import PromoCodesClient from "./PromoCodesClient";

export const dynamic = "force-dynamic";

export default async function PromoCodesPage() {
  await requireAdminRole(["superadmin"]);
  return <PromoCodesClient />;
}
