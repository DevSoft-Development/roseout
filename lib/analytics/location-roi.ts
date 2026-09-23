import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncCanonicalAttribution } from "@/lib/marketing/canonical-attribution";

type ChannelClass = "organic" | "sponsored" | "owned" | "unknown";

export type LocationRoiReport = {
  rangeDays: number;
  generatedAt: string;
  confirmedRevenueCents: number;
  estimatedRevenueCents: number;
  promotionSpendCents: number;
  subscriptionCostCents: number;
  totalInvestmentCents: number;
  confirmedRoiPercent: number | null;
  blendedRoiPercent: number | null;
  touchpoints: number;
  conversions: number;
  reservations: number;
  verifiedVisits: number;
  paidBookings: number;
  byChannel: Record<ChannelClass, {
    touchpoints: number;
    conversions: number;
    confirmedRevenueCents: number;
    estimatedRevenueCents: number;
  }>;
  funnel: {
    touchpoints: number;
    bookings: number;
    verifiedVisits: number;
    revenueConversions: number;
  };
  subscription: {
    plan: string | null;
    status: string | null;
    interval: string | null;
    amountCents: number;
  };
};

function cents(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function roi(revenue: number, investment: number) {
  if (investment <= 0) return null;
  return Math.round(((revenue - investment) / investment) * 1000) / 10;
}

function subscriptionCostForRange(input: {
  amountCents: number;
  interval: string | null;
  status: string | null;
  days: number;
}) {
  if (!["active", "trialing"].includes(String(input.status || "").toLowerCase())) return 0;
  if (input.amountCents <= 0) return 0;
  const interval = String(input.interval || "month").toLowerCase();
  if (interval.includes("year") || interval.includes("annual")) {
    return Math.round(input.amountCents * (input.days / 365));
  }
  return Math.round(input.amountCents * (input.days / 30.4375));
}

export async function getLocationEssentialsRoi(locationId: string, rangeDays = 30): Promise<LocationRoiReport> {
  const days = Math.max(7, Math.min(365, Math.round(rangeDays || 30)));
  await syncCanonicalAttribution({ locationId, lookbackHours: days * 24 + 48 });

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: events, error: eventError }, { data: ledger, error: ledgerError }, { data: location, error: locationError }] = await Promise.all([
    supabaseAdmin
      .from("marketing_attribution_events")
      .select("id,event_type,channel_class,revenue_cents,revenue_kind,is_conversion,conversion_id,reservation_id,visit_id,experience_booking_id,event_ticket_order_id,occurred_at")
      .eq("location_id", locationId)
      .gte("occurred_at", cutoff)
      .order("occurred_at", { ascending: false })
      .limit(20000),
    supabaseAdmin
      .from("promotion_ledger_entries")
      .select("amount_cents,created_at")
      .eq("location_id", locationId)
      .eq("entry_type", "spend")
      .gte("created_at", cutoff)
      .limit(20000),
    supabaseAdmin
      .from("locations")
      .select("subscription_plan,subscription_status,subscription_amount_cents,subscription_interval")
      .eq("id", locationId)
      .maybeSingle(),
  ]);
  if (eventError) throw eventError;
  if (ledgerError) throw ledgerError;
  if (locationError) throw locationError;

  const rows = events || [];
  const confirmedConversionIds = new Set(
    rows
      .filter((row: any) => row.revenue_kind === "confirmed" && Number(row.revenue_cents || 0) > 0)
      .map((row: any) => String(row.conversion_id || row.reservation_id || row.experience_booking_id || row.event_ticket_order_id || row.id)),
  );

  let confirmedRevenueCents = 0;
  let estimatedRevenueCents = 0;
  const conversionKeys = new Set<string>();
  const reservations = new Set<string>();
  const visits = new Set<string>();
  const paidBookings = new Set<string>();
  const revenueConversions = new Set<string>();
  const byChannel: LocationRoiReport["byChannel"] = {
    organic: { touchpoints: 0, conversions: 0, confirmedRevenueCents: 0, estimatedRevenueCents: 0 },
    sponsored: { touchpoints: 0, conversions: 0, confirmedRevenueCents: 0, estimatedRevenueCents: 0 },
    owned: { touchpoints: 0, conversions: 0, confirmedRevenueCents: 0, estimatedRevenueCents: 0 },
    unknown: { touchpoints: 0, conversions: 0, confirmedRevenueCents: 0, estimatedRevenueCents: 0 },
  };

  for (const row of rows as any[]) {
    const channel = (["organic", "sponsored", "owned"].includes(String(row.channel_class))
      ? row.channel_class
      : "unknown") as ChannelClass;
    if (!row.is_conversion) byChannel[channel].touchpoints += 1;

    const conversionKey = String(row.conversion_id || row.reservation_id || row.visit_id || row.experience_booking_id || row.event_ticket_order_id || row.id);
    if (row.is_conversion && !conversionKeys.has(conversionKey)) {
      conversionKeys.add(conversionKey);
      byChannel[channel].conversions += 1;
    }
    if (row.reservation_id) reservations.add(String(row.reservation_id));
    if (row.visit_id || row.event_type === "verified_visit") visits.add(String(row.visit_id || row.id));
    if (row.experience_booking_id) paidBookings.add(`experience:${row.experience_booking_id}`);
    if (row.event_ticket_order_id) paidBookings.add(`ticket:${row.event_ticket_order_id}`);

    const amount = cents(row.revenue_cents);
    if (amount <= 0) continue;
    if (row.revenue_kind === "confirmed") {
      confirmedRevenueCents += amount;
      byChannel[channel].confirmedRevenueCents += amount;
      revenueConversions.add(conversionKey);
    } else if (row.revenue_kind === "estimated" && !confirmedConversionIds.has(conversionKey)) {
      estimatedRevenueCents += amount;
      byChannel[channel].estimatedRevenueCents += amount;
      revenueConversions.add(conversionKey);
    }
  }

  const promotionSpendCents = (ledger || []).reduce((sum: number, row: any) => sum + Math.max(0, Number(row.amount_cents || 0)), 0);
  const subscriptionAmount = cents(location?.subscription_amount_cents);
  const subscriptionCostCents = subscriptionCostForRange({
    amountCents: subscriptionAmount,
    interval: location?.subscription_interval || null,
    status: location?.subscription_status || null,
    days,
  });
  const totalInvestmentCents = promotionSpendCents + subscriptionCostCents;
  const touchpoints = Object.values(byChannel).reduce((sum, channel) => sum + channel.touchpoints, 0);

  return {
    rangeDays: days,
    generatedAt: new Date().toISOString(),
    confirmedRevenueCents,
    estimatedRevenueCents,
    promotionSpendCents,
    subscriptionCostCents,
    totalInvestmentCents,
    confirmedRoiPercent: roi(confirmedRevenueCents, totalInvestmentCents),
    blendedRoiPercent: roi(confirmedRevenueCents + estimatedRevenueCents, totalInvestmentCents),
    touchpoints,
    conversions: conversionKeys.size,
    reservations: reservations.size,
    verifiedVisits: visits.size,
    paidBookings: paidBookings.size,
    byChannel,
    funnel: {
      touchpoints,
      bookings: reservations.size + paidBookings.size,
      verifiedVisits: visits.size,
      revenueConversions: revenueConversions.size,
    },
    subscription: {
      plan: location?.subscription_plan || null,
      status: location?.subscription_status || null,
      interval: location?.subscription_interval || null,
      amountCents: subscriptionAmount,
    },
  };
}
