import { supabaseAdmin } from "@/lib/supabase-admin";

export type DomainBenefitSettings = {
  firstYearIncluded: boolean;
  renewalIncluded: boolean;
};

export const DEFAULT_DOMAIN_BENEFIT_SETTINGS: DomainBenefitSettings = {
  firstYearIncluded: true,
  renewalIncluded: false,
};

export async function getDomainBenefitSettings(): Promise<DomainBenefitSettings> {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "partner_pro_domain_benefit")
      .maybeSingle();

    if (error) {
      console.error("Unable to load Partner Pro domain benefit settings", error);
      return DEFAULT_DOMAIN_BENEFIT_SETTINGS;
    }

    const value = data?.value && typeof data.value === "object" ? data.value as Record<string, unknown> : {};
    return {
      firstYearIncluded: typeof value.firstYearIncluded === "boolean" ? value.firstYearIncluded : DEFAULT_DOMAIN_BENEFIT_SETTINGS.firstYearIncluded,
      renewalIncluded: typeof value.renewalIncluded === "boolean" ? value.renewalIncluded : DEFAULT_DOMAIN_BENEFIT_SETTINGS.renewalIncluded,
    };
  } catch (error) {
    console.error("Unable to load Partner Pro domain benefit settings", error);
    return DEFAULT_DOMAIN_BENEFIT_SETTINGS;
  }
}
