import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata = {
  title: "claims – Admin",
};

export default async function Page() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.claims);
  redirect("/admin/claims");
}
