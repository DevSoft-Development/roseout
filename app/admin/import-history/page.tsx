import { redirect } from "next/navigation";

export default function ImportHistoryRedirect() {
  redirect("/admin/dashboard/import");
}
