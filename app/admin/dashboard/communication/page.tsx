import { requireAdminRole } from "@/lib/admin-auth";
import CommunicationCenterClient from "./CommunicationCenterClient";

export default async function CommunicationCenterPage() {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);
  return <CommunicationCenterClient />;
}
