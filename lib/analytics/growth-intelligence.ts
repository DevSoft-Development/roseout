import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationEssentialsRoi, type LocationRoiReport } from "@/lib/analytics/location-roi";
import { getLocationSearchV2DemandInsights, type LocationDemandInsights } from "@/lib/marketing/location-demand-insights";

type DailyRow = {
  analytics_date: string;
  profile_views: number | null;
  search_appearances: number | null;
  search_clicks: number | null;
  directions_clicks: number | null;
  website_clicks: number | null;
  phone_clicks: number | null;
  share_clicks: number | null;
  reservation_starts: number | null;
  reservation_completions: number | null;
  reservation_cancellations: number | null;
};

export type GrowthIntelligenceSignal = {
  key: string;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
  tone: "positive" | "attention" | "neutral";
};

export type GrowthIntelligenceReport = {
  rangeDays: number;
  generatedAt: string;
  roi: LocationRoiReport;
  demand: LocationDemandInsights;
  engagement: {
    profileViews: number;
    searchAppearances: number;
    searchClicks: number;
    directionsClicks: number;
    websiteClicks: number;
    phoneClicks: number;
    shares: number;
    reservationStarts: number;
    reservationCompletions: number;
    reservationCancellations: number;
    searchCtrPercent: number;
    bookingCompletionPercent: number;
    cancellationPercent: number;
  };
  trends: {
    profileViewsPercent: number | null;
    searchAppearancesPercent: number | null;
    searchClicksPercent: number | null;
    reservationCompletionsPercent: number | null;
  };
  signals: GrowthIntelligenceSignal[];
};

function n(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function trend(current: number, prior: number) {
  if (prior <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

function sum(rows: DailyRow[]) {
  return rows.reduce((acc, row) => ({
    profileViews: acc.profileViews + n(row.profile_views),
    searchAppearances: acc.searchAppearances + n(row.search_appearances),
    searchClicks: acc.searchClicks + n(row.search_clicks),
    directionsClicks: acc.directionsClicks + n(row.directions_clicks),
    websiteClicks: acc.websiteClicks + n(row.website_clicks),
    phoneClicks: acc.phoneClicks + n(row.phone_clicks),
    shares: acc.shares + n(row.share_clicks),
    reservationStarts: acc.reservationStarts + n(row.reservation_starts),
    reservationCompletions: acc.reservationCompletions + n(row.reservation_completions),
    reservationCancellations: acc.reservationCancellations + n(row.reservation_cancellations),
  }), {
    profileViews: 0,
    searchAppearances: 0,
    searchClicks: 0,
    directionsClicks: 0,
    websiteClicks: 0,
    phoneClicks: 0,
    shares: 0,
    reservationStarts: 0,
    reservationCompletions: 0,
    reservationCancellations: 0,
  });
}

export async function getLocationGrowthIntelligence(
  location: Record<string, unknown> & { id: string },
  rangeDays = 30,
): Promise<GrowthIntelligenceReport> {
  const days = Math.max(7, Math.min(365, Math.round(rangeDays || 30)));
  const now = new Date();
  const currentStart = new Date(now.getTime() - days * 86400000);
  const priorStart = new Date(currentStart.getTime() - days * 86400000);

  const [roi, demand, dailyResult] = await Promise.all([
    getLocationEssentialsRoi(location.id, days),
    getLocationSearchV2DemandInsights(location),
    supabaseAdmin
      .from("location_daily_analytics")
      .select("analytics_date,profile_views,search_appearances,search_clicks,directions_clicks,website_clicks,phone_clicks,share_clicks,reservation_starts,reservation_completions,reservation_cancellations")
      .eq("location_id", location.id)
      .gte("analytics_date", priorStart.toISOString().slice(0, 10))
      .lte("analytics_date", now.toISOString().slice(0, 10))
      .order("analytics_date", { ascending: true }),
  ]);

  if (dailyResult.error) throw dailyResult.error;
  const rows = (dailyResult.data || []) as DailyRow[];
  const currentRows = rows.filter((row) => new Date(row.analytics_date + "T00:00:00Z") >= currentStart);
  const priorRows = rows.filter((row) => {
    const date = new Date(row.analytics_date + "T00:00:00Z");
    return date >= priorStart && date < currentStart;
  });
  const current = sum(currentRows);
  const prior = sum(priorRows);

  const engagement = {
    ...current,
    searchCtrPercent: percent(current.searchClicks, current.searchAppearances),
    bookingCompletionPercent: percent(current.reservationCompletions, current.reservationStarts),
    cancellationPercent: percent(current.reservationCancellations, current.reservationCompletions + current.reservationCancellations),
  };

  const signals: GrowthIntelligenceSignal[] = [];
  const locationId = encodeURIComponent(location.id);

  if (demand.trendPercent != null && demand.trendPercent >= 20) {
    signals.push({
      key: "rising-demand",
      title: "Nearby demand is rising",
      detail: `Search V2 demand in ${demand.geographyLabel} is up ${demand.trendPercent}% versus the prior 7 days.`,
      actionLabel: "Open Marketing Studio",
      href: `/locations/dashboard/marketing-studio?locationId=${locationId}`,
      tone: "positive",
    });
  }
  if (demand.demandGaps.length) {
    const gap = demand.demandGaps[0];
    signals.push({
      key: "demand-gap",
      title: "There is unmet local search demand",
      detail: `“${gap.query}” produced ${gap.noResultSearches} no-result searches in the last 30 days.`,
      actionLabel: "Review demand",
      href: `/locations/dashboard/marketing-studio?locationId=${locationId}`,
      tone: "attention",
    });
  }
  if (current.searchAppearances >= 20 && engagement.searchCtrPercent < 5) {
    signals.push({
      key: "low-ctr",
      title: "Search visibility is not converting into enough clicks",
      detail: `Your search click-through rate is ${engagement.searchCtrPercent}% across ${current.searchAppearances} appearances.`,
      actionLabel: "Improve visibility",
      href: `/locations/dashboard/visibility-health?locationId=${locationId}`,
      tone: "attention",
    });
  }
  if (current.reservationStarts >= 10 && engagement.bookingCompletionPercent < 40) {
    signals.push({
      key: "booking-dropoff",
      title: "Reservation starts are dropping before completion",
      detail: `${current.reservationStarts} reservation starts produced ${current.reservationCompletions} completions in this reporting window.`,
      actionLabel: "Review reservations",
      href: `/locations/dashboard/reservations?locationId=${locationId}`,
      tone: "attention",
    });
  }
  if (roi.confirmedRoiPercent != null && roi.confirmedRoiPercent > 0) {
    signals.push({
      key: "positive-roi",
      title: "Confirmed attributable return is positive",
      detail: `Payment-backed attributed revenue is producing a ${roi.confirmedRoiPercent > 0 ? "+" : ""}${roi.confirmedRoiPercent}% confirmed ROI for this window.`,
      actionLabel: "Review attribution",
      href: `/locations/dashboard/analytics?locationId=${locationId}&range=${days}`,
      tone: "positive",
    });
  }
  if (!signals.length) {
    signals.push({
      key: "collecting-signal",
      title: "Growth signal is building",
      detail: "Keep discovery, profile, reservation, and attribution tracking active to unlock stronger recommendations.",
      actionLabel: "Open Marketing & Growth",
      href: `/locations/dashboard/marketing-growth?locationId=${locationId}`,
      tone: "neutral",
    });
  }

  return {
    rangeDays: days,
    generatedAt: now.toISOString(),
    roi,
    demand,
    engagement,
    trends: {
      profileViewsPercent: trend(current.profileViews, prior.profileViews),
      searchAppearancesPercent: trend(current.searchAppearances, prior.searchAppearances),
      searchClicksPercent: trend(current.searchClicks, prior.searchClicks),
      reservationCompletionsPercent: trend(current.reservationCompletions, prior.reservationCompletions),
    },
    signals: signals.slice(0, 5),
  };
}
