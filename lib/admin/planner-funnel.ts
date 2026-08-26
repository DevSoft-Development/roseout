import { supabaseAdmin } from "@/lib/supabase-admin";

const JOURNEY_EVENTS = [
  "planner_intent_completed",
  "planner_make_it_yours_completed",
  "planner_plan_selected",
  "planner_book_plan_viewed",
] as const;

const JOURNEY_LABELS: Record<(typeof JOURNEY_EVENTS)[number], string> = {
  planner_intent_completed: "1 · Plan",
  planner_make_it_yours_completed: "2 · Make It Yours",
  planner_plan_selected: "3 · Pick",
  planner_book_plan_viewed: "4 · Book Plan",
};

type AnalyticsRow = {
  event_name?: string | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  outing_id?: string | null;
};

type OutingRow = {
  id: string;
  contact_method?: string | null;
  external_bookings_required_count?: number | null;
  external_bookings_confirmed_count?: number | null;
  external_bookings_complete?: boolean | null;
  attendance_confirmed_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ReviewRow = {
  id: string;
  outing_id?: string | null;
};

export type PlannerFunnelStage = {
  key: string;
  label: string;
  value: number;
};

export type PlannerFunnelSnapshot = {
  since: string;
  funnel: PlannerFunnelStage[];
  planTypes: { outing: number; restaurant: number; activity: number };
  resultsViewed: number;
  bookPlanStarted: number;
  savedForLater: number;
  bookingActionsStarted: number;
  partiallyBooked: number;
  outingReady: number;
  externalConfirmed: number;
  externalReturned: number;
  postVisitConfirmed: number;
  reviewsSubmitted: number;
  textPlans: number;
  emailPlans: number;
  shares: number;
  topPickImpressions: number;
  sponsoredImpressions: number;
  organicPairImpressions: number;
  topPickSelections: number;
  sponsoredSelections: number;
  organicPairSelections: number;
  buildOwnOpened: number;
  customPairsUsed: number;
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function outingIdFromEvent(row: AnalyticsRow) {
  return stringValue(row.outing_id) || stringValue(row.metadata?.outing_id);
}

function internalReservationRequired(metadata: Record<string, unknown> | null | undefined) {
  const selected = metadata?.selected_locations;
  if (!selected || typeof selected !== "object" || Array.isArray(selected)) return false;
  const locations = selected as Record<string, unknown>;
  return [locations.restaurant, locations.activity].some((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const location = value as Record<string, unknown>;
    return Boolean(
      location.reservation_enabled
      || location.internal_reservations_enabled
      || location.uses_internal_reservations
    );
  });
}

function distinctCount(ids: Set<string>, fallback: number) {
  return ids.size + fallback;
}

export async function getPlannerFunnelSnapshot(days = 30): Promise<PlannerFunnelSnapshot> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const trackedEvents = [
    "planner_started",
    ...JOURNEY_EVENTS,
    "planner_results_viewed",
    "planner_pair_impression",
    "planner_build_own_opened",
    "planner_custom_pair_selected",
    "planner_book_plan_started",
    "guided_plan_saved_for_later",
    "guided_plan_reservation_started",
    "guided_plan_texted",
    "guided_plan_emailed",
    "guided_plan_shared",
    "external_reservation_confirmed",
    "external_reservation_not_completed",
  ];

  const [eventsResult, outingsResult, reviewsResult] = await Promise.all([
    supabaseAdmin
      .from("analytics_events")
      .select("event_name,metadata,source,outing_id")
      .in("event_name", trackedEvents)
      .gte("created_at", since)
      .limit(50000),
    supabaseAdmin
      .from("outings")
      .select("id,contact_method,external_bookings_required_count,external_bookings_confirmed_count,external_bookings_complete,attendance_confirmed_at,metadata")
      .gte("created_at", since)
      .limit(30000),
    supabaseAdmin
      .from("location_reviews")
      .select("id,outing_id")
      .not("outing_id", "is", null)
      .gte("created_at", since)
      .limit(30000),
  ]);

  if (eventsResult.error) console.error("PLANNER_FUNNEL_EVENTS_QUERY_FAILED", eventsResult.error);
  if (outingsResult.error) console.error("PLANNER_FUNNEL_OUTINGS_QUERY_FAILED", outingsResult.error);
  if (reviewsResult.error) console.error("PLANNER_FUNNEL_REVIEWS_QUERY_FAILED", reviewsResult.error);

  const events = (eventsResult.data || []) as AnalyticsRow[];
  const outings = (outingsResult.data || []) as OutingRow[];
  const reviews = (reviewsResult.data || []) as ReviewRow[];

  const journeyCounts = Object.fromEntries(JOURNEY_EVENTS.map((name) => [name, 0])) as Record<(typeof JOURNEY_EVENTS)[number], number>;
  const planTypes = { outing: 0, restaurant: 0, activity: 0 };
  const bookPlanStartedIds = new Set<string>();
  const bookingActionOutingIds = new Set<string>();
  const reviewOutingIds = new Set<string>();

  let starts = 0;
  let resultsViewed = 0;
  let bookPlanStartedFallback = 0;
  let savedForLater = 0;
  let bookingActionFallback = 0;
  let textPlans = 0;
  let emailPlans = 0;
  let shares = 0;
  let externalConfirmed = 0;
  let externalReturned = 0;
  let topPickImpressions = 0;
  let sponsoredImpressions = 0;
  let organicPairImpressions = 0;
  let topPickSelections = 0;
  let sponsoredSelections = 0;
  let organicPairSelections = 0;
  let buildOwnOpened = 0;
  let customPairsUsed = 0;

  for (const row of events) {
    const fromGuidedCreate = row.source === "guided_create";
    const fromPlan = row.source === "guided_plan_page" || row.source === "guided_book_plan";

    if (row.event_name === "planner_started" && fromGuidedCreate) starts += 1;
    if (fromGuidedCreate && JOURNEY_EVENTS.includes(row.event_name as (typeof JOURNEY_EVENTS)[number])) {
      journeyCounts[row.event_name as (typeof JOURNEY_EVENTS)[number]] += 1;
    }
    if (row.event_name === "planner_intent_completed" && fromGuidedCreate) {
      const planType = String(row.metadata?.plan_type || "");
      if (planType === "outing" || planType === "restaurant" || planType === "activity") planTypes[planType] += 1;
    }
    if (row.event_name === "planner_results_viewed" && fromGuidedCreate) resultsViewed += 1;

    if (row.event_name === "planner_pair_impression" && fromGuidedCreate) {
      const placement = String(row.metadata?.placement_group || "");
      if (placement === "sponsored") sponsoredImpressions += 1;
      else if (placement === "top_pick") topPickImpressions += 1;
      else if (placement === "organic") organicPairImpressions += 1;
    }
    if (row.event_name === "planner_plan_selected" && fromGuidedCreate) {
      const placement = String(row.metadata?.placement_group || "");
      if (placement === "sponsored") sponsoredSelections += 1;
      else if (placement === "top_pick") topPickSelections += 1;
      else if (placement === "organic") organicPairSelections += 1;
    }
    if (row.event_name === "planner_build_own_opened" && fromGuidedCreate) buildOwnOpened += 1;
    if (row.event_name === "planner_custom_pair_selected" && fromGuidedCreate) customPairsUsed += 1;

    if (row.event_name === "planner_book_plan_started" && fromGuidedCreate) {
      const outingId = outingIdFromEvent(row);
      if (outingId) bookPlanStartedIds.add(outingId);
      else bookPlanStartedFallback += 1;
    }
    if (row.event_name === "guided_plan_saved_for_later" && fromGuidedCreate) savedForLater += 1;
    if (row.event_name === "guided_plan_reservation_started" && (fromPlan || fromGuidedCreate)) {
      const outingId = outingIdFromEvent(row);
      if (outingId) bookingActionOutingIds.add(outingId);
      else bookingActionFallback += 1;
    }
    if (row.event_name === "guided_plan_texted" && (fromPlan || fromGuidedCreate)) textPlans += 1;
    if (row.event_name === "guided_plan_emailed" && (fromPlan || fromGuidedCreate)) emailPlans += 1;
    if (row.event_name === "guided_plan_shared" && (fromPlan || fromGuidedCreate)) shares += 1;
    if (row.event_name === "external_reservation_confirmed") externalConfirmed += 1;
    if (row.event_name === "external_reservation_not_completed") externalReturned += 1;
  }

  let partiallyBooked = 0;
  let outingReady = 0;
  let postVisitConfirmed = 0;
  for (const outing of outings) {
    const required = numberValue(outing.external_bookings_required_count);
    const confirmed = numberValue(outing.external_bookings_confirmed_count);
    const internalRequired = internalReservationRequired(outing.metadata);
    const bookPlan = outing.contact_method === "book_plan" || bookPlanStartedIds.has(outing.id);

    if (bookPlan && confirmed > 0 && (confirmed < required || internalRequired)) partiallyBooked += 1;
    if (bookPlan && !internalRequired && ((required === 0) || Boolean(outing.external_bookings_complete))) outingReady += 1;
    if (bookPlan && outing.attendance_confirmed_at) postVisitConfirmed += 1;
  }

  for (const review of reviews) {
    if (review.outing_id) reviewOutingIds.add(review.outing_id);
  }

  const bookPlanStarted = distinctCount(bookPlanStartedIds, bookPlanStartedFallback);
  const bookingActionsStarted = distinctCount(bookingActionOutingIds, bookingActionFallback);
  const funnel: PlannerFunnelStage[] = [
    { key: "started", label: "Planner started", value: starts },
    ...JOURNEY_EVENTS.map((eventName) => ({ key: eventName, label: JOURNEY_LABELS[eventName], value: journeyCounts[eventName] })),
    { key: "book_plan_started", label: "Book Plan started", value: bookPlanStarted },
    { key: "booking_action", label: "Booking action", value: bookingActionsStarted },
    { key: "partial", label: "Partially booked", value: partiallyBooked },
    { key: "ready", label: "Outing ready", value: outingReady },
  ];

  return {
    since,
    funnel,
    planTypes,
    resultsViewed,
    bookPlanStarted,
    savedForLater,
    bookingActionsStarted,
    partiallyBooked,
    outingReady,
    externalConfirmed,
    externalReturned,
    postVisitConfirmed,
    reviewsSubmitted: reviewOutingIds.size,
    textPlans,
    emailPlans,
    shares,
    topPickImpressions,
    sponsoredImpressions,
    organicPairImpressions,
    topPickSelections,
    sponsoredSelections,
    organicPairSelections,
    buildOwnOpened,
    customPairsUsed,
  };
}
