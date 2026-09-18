import "./domain-benefit.css";

import { getCurrentAdmin } from "@theouthaven/auth/admin-session";
import DomainBenefitSettingsClient from "./DomainBenefitSettingsClient";
import { getDomainBenefitSettings } from "@/lib/domains/benefit-settings";

export const dynamic = "force-dynamic";

export default async function DomainBenefitSettingsPage() {
  await getCurrentAdmin();
  const settings = await getDomainBenefitSettings();

  return (
    <section className="domain-benefit-page">
      <header>
        <small>Admin Settings</small>
        <h1>Partner Pro Domain Benefit</h1>
        <p>
          Change the included-domain offer without a deployment. Changes apply
          to new eligibility and registration requests.
        </p>
      </header>

      <DomainBenefitSettingsClient initial={settings} />
    </section>
  );
}
