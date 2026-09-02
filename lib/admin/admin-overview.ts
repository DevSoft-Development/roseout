import "server-only";

import {
  platformCoreApiConfigured,
  readAdminOverviewViaCoreApi,
  type CoreAdminOverviewResponse,
} from "@/lib/aws/core-api";
import { BUSINESS_PRO_MONTHLY_CENTS, isBusinessProPlan } from "@/lib/billing/plans";
import { supabaseAdmin } from "@/lib/supabase-admin";

function subscriptionAmount(row: Record<string, any>) {
  return Number(
    row.subscription_amount_cents ||
      (isBusinessProPlan(row.subscription_plan) && row.subscription_status === "active"
        ? BUSINESS_PRO_MONTHLY_CENTS
        : 0),
  );
}

async function readAdminOverviewLocally(): Promise<CoreAdminOverviewResponse> {
  const today = new Date().toISOString().split("T")[0];
  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  const [
    restaurants,
    activities,
    reservations,
    todayReservations,
    upcomingReservations,
    activeEvents,
    activeExperiences,
    eventOrders30d,
    experienceBookings30d,
    experiencePrices,
    billingLocations,
    paymentLogs30d,
    openTicketsResult,
    mlScored,
    mlIntentRows,
    mlPairRows,
    mlLastRun,
    generatedSites,
    liveGeneratedSites,
    hostingNodes,
    healthyHostingNodes,
  ] = await Promise.all([
    supabaseAdmin.from("restaurants").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("activities").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("location_reservations").select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("location_reservations")
      .select("id", { count: "exact", head: true })
      .eq("reservation_date", today)
      .not("status", "in", "(cancelled,declined)"),
    supabaseAdmin
      .from("location_reservations")
      .select("id", { count: "exact", head: true })
      .gte("reservation_date", today)
      .lte("reservation_date", sevenDaysOut)
      .not("status", "in", "(cancelled,declined)"),
    supabaseAdmin
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("source_kind", "native")
      .eq("status", "scheduled")
      .eq("searchable", true),
    supabaseAdmin
      .from("experiences")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("searchable", true),
    supabaseAdmin
      .from("event_ticket_orders")
      .select("id,quantity,status,payment_status,ticket_subtotal_cents,total_cents,platform_fee_cents,created_at")
      .gte("created_at", thirtyDaysAgo)
      .limit(5000),
    supabaseAdmin
      .from("experience_bookings")
      .select("id,experience_id,party_size,status,created_at")
      .gte("created_at", thirtyDaysAgo)
      .limit(5000),
    supabaseAdmin.from("experiences").select("id,price_per_person").limit(5000),
    supabaseAdmin
      .from("locations")
      .select("id,subscription_plan,subscription_status,subscription_amount_cents,subscription_interval")
      .limit(5000),
    supabaseAdmin
      .from("payment_logs")
      .select("id,event_type,amount_paid_cents,created_at")
      .gte("created_at", thirtyDaysAgo)
      .eq("event_type", "invoice.payment_succeeded")
      .limit(5000),
    supabaseAdmin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .not("status", "in", "(closed,resolved)"),
    supabaseAdmin.from("location_ml_features").select("location_id", { count: "exact", head: true }),
    supabaseAdmin.from("location_intent_ml_features").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("location_pair_ml_features").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("location_ml_score_runs").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("business_websites").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("business_websites").select("id", { count: "exact", head: true }).eq("status", "live"),
    supabaseAdmin.from("website_hosting_nodes").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("website_hosting_nodes").select("id", { count: "exact", head: true }).eq("status", "healthy"),
  ]);

  const paidEventOrders = (eventOrders30d.data || []).filter(
    (row) =>
      row.status !== "refunded" &&
      row.status !== "cancelled" &&
      (row.payment_status === "paid" || row.status === "confirmed"),
  );
  const eventOrders = paidEventOrders.length;
  const eventTickets = paidEventOrders.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const eventSalesCents = paidEventOrders.reduce(
    (sum, row) => sum + Number(row.ticket_subtotal_cents || row.total_cents || 0),
    0,
  );
  const eventPlatformRevenueCents = paidEventOrders.reduce(
    (sum, row) => sum + Number(row.platform_fee_cents || 0),
    0,
  );

  const activeExperienceBookings = (experienceBookings30d.data || []).filter(
    (row) => !["cancelled", "refunded"].includes(String(row.status || "").toLowerCase()),
  );
  const experienceBookingCount = activeExperienceBookings.length;
  const experienceGuests = activeExperienceBookings.reduce(
    (sum, row) => sum + Number(row.party_size || 0),
    0,
  );
  const priceByExperience = new Map(
    (experiencePrices.data || []).map((row) => [String(row.id), Number(row.price_per_person || 0)]),
  );
  const experienceEstimatedValueCents = activeExperienceBookings.reduce(
    (sum, row) =>
      sum + Math.round(Number(row.party_size || 0) * Number(priceByExperience.get(String(row.experience_id)) || 0) * 100),
    0,
  );

  const billingRows = billingLocations.error ? [] : billingLocations.data || [];
  const activePaidLocations = billingRows.filter(
    (row) =>
      ["active", "grace_period", "comped"].includes(String(row.subscription_status || "")) &&
      isBusinessProPlan(row.subscription_plan),
  );
  const mrrCents = activePaidLocations.reduce((sum, row) => {
    const amount = subscriptionAmount(row);
    return sum + (row.subscription_interval === "year" || row.subscription_interval === "annual" ? Math.round(amount / 12) : amount);
  }, 0);
  const subscriptionCollected30dCents = paymentLogs30d.error
    ? 0
    : (paymentLogs30d.data || []).reduce((sum, row) => sum + Number(row.amount_paid_cents || 0), 0);

  return {
    success: true,
    totalLocations: Number(restaurants.count || 0) + Number(activities.count || 0),
    reservations: Number(reservations.count || 0),
    todayReservations: Number(todayReservations.count || 0),
    upcomingReservations: Number(upcomingReservations.count || 0),
    activeEvents: Number(activeEvents.count || 0),
    activeExperiences: Number(activeExperiences.count || 0),
    eventOrders,
    eventTickets,
    eventSalesCents,
    eventPlatformRevenueCents,
    experienceBookingCount,
    experienceGuests,
    experienceEstimatedValueCents,
    activePaidLocations: activePaidLocations.length,
    mrrCents,
    subscriptionCollected30dCents,
    trackedPlatformRevenue30dCents: subscriptionCollected30dCents + eventPlatformRevenueCents,
    openTickets: Number(openTicketsResult.count || 0),
    mlScored: Number(mlScored.count || 0),
    mlIntentRows: Number(mlIntentRows.count || 0),
    mlPairRows: Number(mlPairRows.count || 0),
    mlLastRunCreatedAt: mlLastRun.data?.created_at || null,
    generatedSites: Number(generatedSites.count || 0),
    liveGeneratedSites: Number(liveGeneratedSites.count || 0),
    hostingNodes: Number(hostingNodes.count || 0),
    healthyHostingNodes: Number(healthyHostingNodes.count || 0),
  };
}

export async function readAdminOverview(): Promise<CoreAdminOverviewResponse> {
  if (platformCoreApiConfigured()) {
    try {
      return await readAdminOverviewViaCoreApi();
    } catch (error) {
      console.warn("Core admin overview unavailable; using local fallback", error);
    }
  }
  return readAdminOverviewLocally();
}
