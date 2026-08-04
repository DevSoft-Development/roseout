import { redirect } from "next/navigation";
export default function ActivityAuditRedirect() { redirect("/admin/dashboard/crm/operations?view=activity"); }
