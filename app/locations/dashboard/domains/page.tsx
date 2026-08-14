import { GrowthProShell } from "@/components/growth-pro/GrowthProShell";
import PartnerProDomainSearch from "@/components/growth-pro/PartnerProDomainSearch";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { domainBenefitCustomerCopy } from "@/lib/domains/benefit-copy";
import { getDomainBenefitSettings } from "@/lib/domains/benefit-settings";
import {
  buildDemoOwnerHref,
  requireDemoOwnerLocation,
  type DemoSearchParams,
} from "@/lib/demo/owner-context";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<DemoSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const demo = await requireDemoOwnerLocation(params);
  const [fallbackLocation, benefitSettings] = await Promise.all([
    demo.location ? Promise.resolve(null) : getCurrentBusinessLocation(),
    getDomainBenefitSettings(),
  ]);
  const location = demo.location || fallbackLocation;
  const benefitCopy = domainBenefitCustomerCopy(benefitSettings);
  const navHrefBuilder = (href: string) =>
    demo.demoMode && location ? buildDemoOwnerHref(href, location) || href : href;

  return (
    <GrowthProShell
      title="Domain"
      demoMode={demo.demoMode}
      returnHref={demo.demoMode ? "/admin/dashboard/settings/demo-center" : undefined}
      navHrefBuilder={navHrefBuilder}
    >
      {!location ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-black">No claimed location found</h2>
          <p className="mt-2 text-sm text-white/60">Connect a business location before choosing an included domain.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <section className="rounded-3xl border border-rose-200/15 bg-white/[0.04] p-6">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Partner Pro benefit</p>
            <h2 className="mt-3 text-2xl font-black">Included custom domain</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">{benefitCopy}</p>
            {location.included_domain_name ? (
              <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100/70">Included domain</p>
                <p className="mt-2 text-xl font-black text-emerald-50">{location.included_domain_name}</p>
              </div>
            ) : null}
          </section>

          {!benefitSettings.firstYearIncluded && !location.included_domain_name ? (
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <p className="text-sm font-bold text-white/80">The included domain offer is currently turned off.</p>
              <p className="mt-2 text-sm text-white/55">Your other Partner Pro features are not affected.</p>
            </section>
          ) : benefitSettings.firstYearIncluded ? (
            <div className="[&>div>section:first-child]:hidden">
              <PartnerProDomainSearch
                locationId={location.id}
                claimedDomain={location.included_domain_name || null}
              />
            </div>
          ) : null}
        </div>
      )}
    </GrowthProShell>
  );
}
