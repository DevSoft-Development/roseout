import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function OrganizationVerificationPage() {
  redirect("/admin/dashboard/crm/accounts#organization-verification");
}
