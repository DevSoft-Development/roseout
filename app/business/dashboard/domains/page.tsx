import { GrowthProShell } from "@/components/growth-pro/GrowthProShell";
import PartnerProDomainSearch from "@/components/growth-pro/PartnerProDomainSearch";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { domainBenefitCustomerCopy } from "@/lib/domains/benefit-copy";
import { getDomainBenefitSettings } from "@/lib/domains/benefit-settings";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [location, benefitSettings] = await Promise.all([
    getCurrentBusinessLocation(),
    getDomainBenefitSettings(),
  ]);
  const benefitCopy = domainBenefitCustomerCopy(benefitSettings);

  return (
    <GrowthProShell title="Domain">
      {!location ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-black">No claimed location found</h2>
          <p className="mt-2 text-sm text-white/60">Connect a business location before choosing an included domain.</p>
        </div>
      ) : (
        <PartnerProDomainSearch
          locationId={location.id}
          claimedDomain={location.included_domain_name || null}
          benefitEnabled={benefitSettings.firstYearIncluded}
          benefitCopy={benefitCopy}
        />
      )}
    </GrowthProShell>
  );
}
