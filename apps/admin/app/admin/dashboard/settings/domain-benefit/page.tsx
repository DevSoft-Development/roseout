import { getCurrentAdmin } from "@theouthaven/auth/admin-session";
import DomainBenefitSettingsClient from "./DomainBenefitSettingsClient";
import { getDomainBenefitSettings } from "@/lib/domains/benefit-settings";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function DomainBenefitSettingsPage() {
  await getCurrentAdmin();
  const settings = await getDomainBenefitSettings();

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Business Controls"
        title="Partner Pro Domain Benefit"
        subtitle="Change the included-domain offer without a deployment. Updates apply to new eligibility and registration requests."
        badge={<AdminStatusBadge tone="green">Configuration active</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/settings">Settings</AdminActionButton>}
      />

      <AdminSectionCard className="p-5">
        <DomainBenefitSettingsClient initial={settings} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
