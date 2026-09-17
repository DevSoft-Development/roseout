import { redirect } from "next/navigation";

export default function AdminAppRoot() {
  redirect("/admin/login");
}
