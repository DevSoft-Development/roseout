import { redirect } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { CRM_READ_ROLES } from "@/lib/crm/permissions";

export const dynamic="force-dynamic";

export default async function CrmTodayPage(){
  await requireAdminRole(CRM_READ_ROLES);
  redirect("/admin/dashboard/crm/sales");
}
