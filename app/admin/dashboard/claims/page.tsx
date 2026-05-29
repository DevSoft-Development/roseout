import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";

export const metadata = {
  title: "claims – Admin",
};

export default async function Page() {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);
  redirect("/admin/claims");
}
