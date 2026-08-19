import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function OrganizerVerificationPage() {
  redirect("/admin/dashboard/crm/accounts#organizer-verification");
}
