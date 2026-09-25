import { redirect } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { CRM_READ_ROLES } from "@/lib/crm/permissions";

export const dynamic="force-dynamic";

export default async function GtmPage(){
  const actor=await requireAdminRole(CRM_READ_ROLES);
  const leadership=["superadmin","admin","manager"].includes(String(actor.role));
  redirect(leadership?"/admin/dashboard/crm/sales/leadership":"/admin/dashboard/crm/sales");
}
