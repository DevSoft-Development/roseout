import { redirect } from "next/navigation";

import { requireAdminRole } from "@/lib/admin-auth";
import { CRM_READ_ROLES } from "@/lib/crm/permissions";

export const dynamic = "force-dynamic";

export default async function RedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminRole(CRM_READ_ROLES);
  const params = await searchParams;
  if (params.create === "task") redirect("/admin/dashboard/crm/work-queue/new");
  redirect("/admin/dashboard/crm/my-work");
}
