import { redirect } from "next/navigation";

export default function AdminUsersRedirect() {
  redirect("/admin/dashboard/users");
}
