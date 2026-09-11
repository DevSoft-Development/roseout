import type { DomainBenefitSettings } from "@/lib/domains/benefit-settings";

export function domainBenefitCustomerCopy(settings: DomainBenefitSettings) {
  if (!settings.firstYearIncluded) return "The included domain offer is not currently available.";
  if (settings.renewalIncluded) return "Your first year and eligible renewals are included with Essentials.";
  return "Your first year is included with Essentials. Renewal after the first year is not included.";
}
