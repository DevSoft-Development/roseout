import "./domain-benefit.css";

import { getCurrentAdmin } from "@theouthaven/auth/admin-session";
import DomainBenefitSettingsClient from "./DomainBenefitSettingsClient";
import { getDomainBenefitSettings } from "@/lib/domains/benefit-settings";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function DomainBenefitSettingsPage() {
  await getCurrentAdmin();
  const settings = await getDomainBenefitSettings();

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Settings · Commercial Controls"
        title="Partner Pro Domain Benefit"
        subtitle="Change the included-domain offer without a deployment. Changes apply to new eligibility and registration requests."
        badge={<AdminStatusBadge tone="green">Runtime configurable</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/settings">Settings</AdminActionButton>}
      />
      <section className="domain-benefit-page">
        <DomainBenefitSettingsClient initial={settings} />
      </section>
    </AdminPageShell>
  );
}
