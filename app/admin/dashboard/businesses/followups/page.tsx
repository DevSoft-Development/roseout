import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function LegacyBusinessFollowupsPage() {
  redirect(`${ROUTES.adminCrm}/work-queue?view=follow-ups`);
}
