import { supabase } from "@/lib/supabase";

export type CRMStatus =
  | "Unclaimed"
  | "Contacted"
  | "Claimed"
  | "Active Free"
  | "Upgrade Opportunity"
  | "Pro"
  | "Enterprise"
  | "At Risk";

export type BusinessCRMRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  is_claimed: boolean | null;
  reservation_url: string | null;
  crm_status: CRMStatus;
  opportunity_score: number;
  upgrade_probability: number;
  engagement_score: number;
  traffic_score: number;
  conversion_score: number;
  retention_score: number;
  churn_risk_score: number;
  trending_score: number;
  reservation_completions_30d: number;
  profile_views_30d: number;
  search_appearances_30d: number;
  saves_30d: number;
  conversion_rate_30d: number;
};

export async function listBusinessCRM(limit = 120): Promise<BusinessCRMRow[]> {
  const { data, error } = await supabase
    .from("business_crm_snapshot")
    .select("*")
    .order("opportunity_score", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch business_crm_snapshot", error);
    return [];
  }

  return (data || []) as BusinessCRMRow[];
}

export async function getBusinessCRM(id: string): Promise<BusinessCRMRow | null> {
  const { data, error } = await supabase
    .from("business_crm_snapshot")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch business CRM row", error);
    return null;
  }

  return (data as BusinessCRMRow | null) || null;
}

export function getUpgradeFlags(business: BusinessCRMRow): string[] {
  const flags: string[] = [];

  if (!business.is_claimed && business.traffic_score >= 70) flags.push("High Traffic Free Account");
  if (business.reservation_completions_30d >= 30) flags.push("High Reservation Activity");
  if (business.trending_score >= 65) flags.push("Trending Location");
  if (!business.reservation_url) flags.push("Missing Reservation Link");
  if (business.search_appearances_30d >= 200) flags.push("Strong Search Visibility");
  if (business.saves_30d >= 20) flags.push("High Save Rate");
  if (business.conversion_rate_30d <= 0.08 && business.traffic_score >= 60) flags.push("High Conversion Potential");
  if (business.opportunity_score >= 75) flags.push("Candidate For Promoted Listings");

  return flags;
}
