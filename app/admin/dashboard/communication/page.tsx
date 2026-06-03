import { requireAdminRole } from "@/lib/admin-auth";
import CommunicationCenterClient from "./CommunicationCenterClient";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export default async function CommunicationCenterPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.communication);
  return <CommunicationCenterClient />;
}
