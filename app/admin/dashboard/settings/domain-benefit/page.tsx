import DomainBenefitSettingsClient from "../DomainBenefitSettingsClient";
import { getDomainBenefitSettings } from "@/lib/domains/benefit-settings";

export const dynamic = "force-dynamic";

export default async function DomainBenefitSettingsPage() {
  const settings = await getDomainBenefitSettings();
  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-300">Admin Settings</p>
        <h1 className="mt-2 text-3xl font-black">Partner Pro Domain Benefit</h1>
        <p className="mt-2 text-sm text-white/60">Change the included-domain offer without a deployment. Changes apply to new eligibility and registration requests.</p>
        <div className="mt-6"><DomainBenefitSettingsClient initial={settings} /></div>
      </div>
    </main>
  );
}
