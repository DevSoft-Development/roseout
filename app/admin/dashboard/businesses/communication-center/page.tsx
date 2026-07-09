import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function LegacyBusinessCommunicationCenterPage() {
  redirect(`${ROUTES.adminCrm}/operations?view=communication-center`);
}
