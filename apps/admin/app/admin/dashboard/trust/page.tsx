import { ShieldCheck } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import VerificationWork from "../crm/accounts/VerificationWork";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trust & Verification | TheOutHaven Admin" };

export default async function TrustPage() {
  await requireAdminRole(["superadmin", "admin", "ambassador", "experience_team", "viewer"]);
  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Trust · Verification"
        title="Verification"
        subtitle="Review organization legitimacy and organizer publishing trust from one protected Admin queue."
        badge={<AdminStatusBadge tone="green"><ShieldCheck className="mr-1 h-3.5 w-3.5" />Trust operations</AdminStatusBadge>}
      />
      <VerificationWork />
    </AdminPageShell>
  );
}