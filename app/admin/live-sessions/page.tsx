import AdminLiveSessionsClient from "./AdminLiveSessionsClient";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Live Sessions Admin",
  description: "Monitor live TheOutHaven sessions from the admin dashboard.",
  path: "/admin/live-sessions",
  noIndex: true,
});
export const dynamic = "force-dynamic";

export default function AdminLiveSessionsPage() {
  return <AdminLiveSessionsClient />;
}
