import { getBusinessCRM } from "@/lib/admin-crm";

export async function getLocationCrmAnalytics(locationId: string) {
  const row = await getBusinessCRM(locationId);
  return {
    profileViews: row?.profile_views_30d || 0,
    searchAppearances: row?.search_appearances_30d || 0,
    saves: row?.saves_30d || 0,
    reserveClicks: row?.reservation_completions_30d || 0,
    callClicks: row?.call_clicks_30d || 0,
    websiteClicks: row?.website_clicks_30d || 0,
    qrScans: row?.qr_scans_30d || 0,
    conversionRate: row?.conversion_rate_30d || 0,
  };
}
