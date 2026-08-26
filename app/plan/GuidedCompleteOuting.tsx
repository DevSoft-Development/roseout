"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { trackClientEvent } from "@/lib/analytics/trackClientEvent";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationName } from "@/lib/locationName";
import { getLocationDetailHref } from "@/lib/locationLinks";
import { buildGooglePlaceDirectionsUrl } from "@/lib/googleDirections";
import { getExternalReservationUrl, getInternalReservationHref } from "@/lib/reservation";
import GuidedJourneySteps from "@/components/planner/GuidedJourneySteps";

type PlanLocation = Record<string, unknown> & {
  id?: string | number | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  activity_type?: string | null;
  primary_category?: string | null;
  rating?: number | null;
  website?: string | null;
  phone?: string | null;
  detail_location_type?: string | null;
  location_type?: string | null;
  source_table?: string | null;
  sourceTable?: string | null;
  reservation_enabled?: boolean | null;
  external_reservation_url?: string | null;
  reservation_url?: string | null;
  reservation_link?: string | null;
  booking_url?: string | null;
  internal_reservations_enabled?: boolean | null;
  uses_internal_reservations?: boolean | null;
};

type OutingTime = {
  plannedFor?: string | null;
  timezone?: string | null;
  outingDateContext?: string | null;
  outingTimeConfidence?: "none" | "date_only" | "exact";
  remindersEnabled?: boolean;
  outingDateLabel?: string | null;
  outingTimeLabel?: string | null;
  outingDateTimeText?: string | null;
};

type SavedPlan = {
  restaurant?: PlanLocation | null;
  activity?: PlanLocation | null;
  outingTime?: OutingTime | null;
};

type BookingRow = {
  location_id: string;
  location_type?: string | null;
  provider?: string | null;
  status: "available" | "started" | "confirmed" | "failed" | "abandoned" | string;
};

type BookingSummary = {
  required: number;
  confirmed: number;
  complete: boolean;
  bookings: BookingRow[];
};

type ActiveOuting = {
  id: string;
  planUrl: string;
  mode: "saved" | "booking";
  summary: BookingSummary;
};

type ShareMode = "text" | "email" | null;
type PendingReservation = { locationId: string | null; locationName: string; outingId?: string | null };

const PLAN_KEY = "theouthaven_plan";
const ACTIVE_OUTING_KEY = "theouthaven_active_outing";
const PENDING_KEY = "theouthaven_pending_external_reservation";
const EMPTY_SUMMARY: BookingSummary = { required: 0, confirmed: 0, complete: false, bookings: [] };

function trackGuided(eventName: string, metadata: Record<string, unknown> = {}) {
  try {
    trackClientEvent({
      event_name: eventName,
      source: "guided_create",
      metadata: {
        step: 4,
        flow_version: "guided_create_v1",
        journey_version: "four_step",
        ...metadata,
      },
    });
  } catch {
    // Analytics must not block the customer journey.
  }
}

function trackPlanEvent(eventName: string, metadata: Record<string, unknown> = {}) {
  fetch("/api/analytics/plan-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      event_name: eventName,
      event_type: "plan_click",
      conversion_step: eventName,
      page_path: "/plan",
      source: "guided_plan_page",
      metadata: {
        flow_version: "guided_create_v1",
        journey_version: "four_step",
        ...metadata,
      },
    }),
  }).catch(() => undefined);
}

function trackLocationAction(locationId: string | null, eventType: string, metadata: Record<string, unknown>) {
  if (!locationId) return;
  fetch("/api/analytics/location-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      location_id: locationId,
      event_type: eventType,
      event_source: "plan",
      source_page: "/plan",
      source_section: "guided_book_plan",
      metadata,
    }),
  }).catch(() => undefined);
}

function trackedOutbound(
  to: string,
  type: "reservation" | "phone" | "website" | "directions",
  location: PlanLocation,
  locationType: "restaurant" | "activity",
  planTitle: string,
  outingId?: string | null,
) {
  const params = new URLSearchParams({
    to,
    type,
    locationType,
    source: "guided_book_plan",
    planTitle,
  });
  if (location.id) params.set("locationId", String(location.id));
  if (outingId) params.set("outingId", outingId);
  return `/api/track/outbound?${params.toString()}`;
}

function detailHref(location: PlanLocation, type: "restaurant" | "activity") {
  return `${getLocationDetailHref({
    id: location.id,
    type,
    sourceTable: location.source_table || location.sourceTable,
    location,
  })}?from=/plan`;
}

function loadPlan(): SavedPlan | null {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    return raw ? (JSON.parse(raw) as SavedPlan) : null;
  } catch {
    return null;
  }
}

function loadActiveOuting(): ActiveOuting | null {
  try {
    const raw = localStorage.getItem(ACTIVE_OUTING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveOuting>;
    if (!parsed.id || !parsed.planUrl) return null;
    return {
      id: parsed.id,
      planUrl: parsed.planUrl,
      mode: parsed.mode === "booking" ? "booking" : "saved",
      summary: parsed.summary || EMPTY_SUMMARY,
    };
  } catch {
    return null;
  }
}

function primaryLocation(plan: SavedPlan | null) {
  return plan?.restaurant || plan?.activity || null;
}

function metaFor(location: PlanLocation, type: "restaurant" | "activity") {
  return [
    type === "restaurant"
      ? location.cuisine || location.cuisine_type || "Restaurant"
      : location.activity_type || location.primary_category || "Activity",
    location.city,
    location.rating ? `★ ${location.rating}` : null,
  ].filter(Boolean).join(" · ");
}

function requiresInternalReservation(location: PlanLocation | null | undefined, type: "restaurant" | "activity") {
  return Boolean(
    location
    && (location.reservation_enabled || location.internal_reservations_enabled || location.uses_internal_reservations)
    && getInternalReservationHref(location, type),
  );
}

function bookingStatusFor(summary: BookingSummary, locationId: string | null) {
  if (!locationId) return null;
  return summary.bookings.find((booking) => booking.location_id === locationId)?.status || null;
}

export default function GuidedCompleteOuting() {
  const searchParams = useSearchParams();
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [activeOuting, setActiveOuting] = useState<ActiveOuting | null>(null);
  const [shareMode, setShareMode] = useState<ShareMode>(null);
  const [contact, setContact] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingReservation, setPendingReservation] = useState<PendingReservation | null>(null);

  useEffect(() => {
    document.title = "Book Your Plan | TheOutHaven";
    const saved = loadPlan();
    const active = loadActiveOuting();
    setPlan(saved);
    setActiveOuting(active);
    trackGuided("planner_book_plan_viewed", {
      has_restaurant: Boolean(saved?.restaurant),
      has_activity: Boolean(saved?.activity),
      has_saved_outing: Boolean(active?.id),
    });
  }, []);

  useEffect(() => {
    function readPending() {
      try {
        const raw = sessionStorage.getItem(PENDING_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as PendingReservation & { startedAt?: number };
        if (!parsed.startedAt || Date.now() - parsed.startedAt < 1000 * 60 * 60 * 6) {
          setPendingReservation(parsed);
        } else {
          sessionStorage.removeItem(PENDING_KEY);
        }
      } catch {
        // Ignore malformed state.
      }
    }
    window.addEventListener("focus", readPending);
    document.addEventListener("visibilitychange", readPending);
    readPending();
    return () => {
      window.removeEventListener("focus", readPending);
      document.removeEventListener("visibilitychange", readPending);
    };
  }, []);

  useEffect(() => {
    if (!activeOuting?.id) return;
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch(`/api/outings/external-bookings?outingId=${encodeURIComponent(activeOuting!.id)}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && data.ok && data.summary) {
          setActiveOuting((current) => current ? persistActive({ ...current, summary: data.summary as BookingSummary }) : current);
        }
      } catch {
        // Booking status refresh is best effort.
      }
    }
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    void refresh();
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [activeOuting?.id]);

  const title = useMemo(() => {
    const names = [
      plan?.restaurant ? getLocationName(plan.restaurant, "") : "",
      plan?.activity ? getLocationName(plan.activity, "") : "",
    ].filter(Boolean);
    return names.length ? names.join(" + ") : "Your TheOutHaven Plan";
  }, [plan]);

  const internalRequiredCount = useMemo(() => {
    let count = 0;
    if (requiresInternalReservation(plan?.restaurant, "restaurant")) count += 1;
    if (requiresInternalReservation(plan?.activity, "activity")) count += 1;
    return count;
  }, [plan]);

  const bookingMode = activeOuting?.mode === "booking";
  const bookingSummary = activeOuting?.summary || EMPTY_SUMMARY;
  const externalComplete = bookingSummary.required > 0 && bookingSummary.complete;
  const noBookingsRequired = bookingSummary.required === 0 && internalRequiredCount === 0;
  const outingReady = bookingMode && internalRequiredCount === 0 && (noBookingsRequired || externalComplete);

  function persistActive(next: ActiveOuting) {
    try {
      localStorage.setItem(ACTIVE_OUTING_KEY, JSON.stringify(next));
    } catch {
      // Local continuity is best effort.
    }
    return next;
  }

  async function createSavedOuting(contactMethod: "book_plan" | "save" | "text" | "email", source: string, mode: "saved" | "booking", contactValue?: string) {
    if (!plan) throw new Error("missing_plan");
    const primary = primaryLocation(plan);
    if (!primary?.id) throw new Error("missing_location");
    const timing = plan.outingTime || {};
    const response = await fetch("/api/outings/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location_id: String(primary.id),
        restaurantLocationId: plan.restaurant?.id ? String(plan.restaurant.id) : null,
        activityLocationId: plan.activity?.id ? String(plan.activity.id) : null,
        source,
        sourceQuery: searchParams.get("q") || title,
        page_path: "/plan",
        planTitle: title,
        selectedLocations: { restaurant: plan.restaurant || null, activity: plan.activity || null },
        plannedFor: timing.plannedFor || null,
        timezone: timing.timezone || "America/New_York",
        outingDateContext: timing.outingDateContext || null,
        outingTimeConfidence: timing.outingTimeConfidence || "none",
        remindersEnabled: Boolean(timing.remindersEnabled),
        outingTiming: {
          outingDateLabel: timing.outingDateLabel || null,
          outingTimeLabel: timing.outingTimeLabel || null,
          outingDateTimeText: timing.outingDateTimeText || null,
        },
        guestEmail: contactMethod === "email" ? contactValue || null : null,
        guestPhone: contactMethod === "text" ? contactValue || null : null,
        contact_method: contactMethod,
        emailOptIn: false,
        smsOptIn: contactMethod === "text" && smsConsent,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok || !data.outing_id || !data.planUrl) {
      throw new Error(data.message || "We could not save your plan yet.");
    }

    let summary = EMPTY_SUMMARY;
    try {
      const bookingResponse = await fetch("/api/outings/external-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", outingId: data.outing_id }),
      });
      const bookingData = await bookingResponse.json().catch(() => ({}));
      if (bookingResponse.ok && bookingData.ok && bookingData.summary) summary = bookingData.summary as BookingSummary;
    } catch {
      // Saving the plan must still succeed if booking classification is temporarily unavailable.
    }

    const next = persistActive({ id: data.outing_id, planUrl: data.planUrl, mode, summary });
    setActiveOuting(next);
    return next;
  }

  async function startBooking() {
    if (!plan || saving) return;
    setSaving(true);
    setActionStatus("Saving your outing before booking…");
    try {
      let next = activeOuting;
      if (!next) {
        next = await createSavedOuting("book_plan", "guided_book_plan", "booking");
      } else if (next.mode !== "booking") {
        next = persistActive({ ...next, mode: "booking" });
        setActiveOuting(next);
      }
      trackGuided("planner_book_plan_started", { outing_id: next.id, plan_title: title });
      trackPlanEvent("planner_book_plan_started", { outing_id: next.id, plan_title: title });
      const remaining = Math.max(0, next.summary.required - next.summary.confirmed) + internalRequiredCount;
      setActionStatus(remaining > 0 ? `${remaining} booking${remaining === 1 ? "" : "s"} still need attention.` : "Your plan is saved and ready to go.");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "We could not start booking yet.");
    } finally {
      setSaving(false);
    }
  }

  async function saveForLater() {
    if (!plan || saving) return;
    setSaving(true);
    setActionStatus("Saving your plan…");
    try {
      if (!activeOuting) await createSavedOuting("save", "guided_save_for_later", "saved");
      trackGuided("guided_plan_saved_for_later", { plan_title: title });
      trackPlanEvent("guided_plan_saved_for_later", { plan_title: title });
      setActionStatus("Plan saved for later.");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "We could not save your plan yet.");
    } finally {
      setSaving(false);
    }
  }

  async function sendPlan() {
    if (!shareMode || !plan) return;
    if (!contact.trim()) {
      setShareStatus(shareMode === "email" ? "Enter an email address." : "Enter a mobile number.");
      return;
    }
    if (shareMode === "text" && !smsConsent) {
      setShareStatus("Check the SMS terms box to receive your plan by text.");
      return;
    }

    setSending(true);
    setShareStatus(shareMode === "email" ? "Emailing your plan…" : "Texting your plan…");
    try {
      let outing = activeOuting;
      if (!outing) {
        outing = await createSavedOuting(shareMode, "guided_plan_share", "saved", contact.trim());
      } else if (shareMode === "email") {
        const response = await fetch("/api/outings/email-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outingId: outing.id, to: contact.trim() }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.message || "We could not email your plan yet.");
      }

      if (shareMode === "text") {
        const textResponse = await fetch("/api/outings/text-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: contact.trim(),
            planTitle: title,
            planUrl: outing.planUrl,
            outingId: outing.id,
            restaurantLocationId: plan.restaurant?.id ? String(plan.restaurant.id) : null,
            activityLocationId: plan.activity?.id ? String(plan.activity.id) : null,
            restaurantName: plan.restaurant ? getLocationName(plan.restaurant, "") : null,
            activityName: plan.activity ? getLocationName(plan.activity, "") : null,
          }),
        });
        const textData = await textResponse.json().catch(() => ({}));
        if (!textResponse.ok || !textData.ok) throw new Error(textData.message || "Your plan was saved, but the text could not be sent.");
      }

      const eventName = shareMode === "email" ? "guided_plan_emailed" : "guided_plan_texted";
      trackGuided(eventName, { plan_title: title, outing_id: outing.id });
      trackPlanEvent(eventName, { plan_title: title, outing_id: outing.id });
      setShareStatus(shareMode === "email" ? "Plan sent to your email." : "Plan sent by text.");
      window.setTimeout(() => {
        setShareMode(null);
        setContact("");
        setSmsConsent(false);
        setShareStatus("");
      }, 1600);
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : "We could not send your plan yet.");
    } finally {
      setSending(false);
    }
  }

  async function sharePlan() {
    try {
      let outing = activeOuting;
      if (!outing) outing = await createSavedOuting("save", "guided_plan_share", "saved");
      const text = `${title} — TheOutHaven`;
      if (navigator.share) {
        await navigator.share({ title: "My TheOutHaven Plan", text, url: outing.planUrl });
      } else {
        await navigator.clipboard.writeText(outing.planUrl);
        setActionStatus("Plan link copied.");
      }
      trackGuided("guided_plan_shared", { plan_title: title, outing_id: outing.id });
      trackPlanEvent("guided_plan_shared", { plan_title: title, outing_id: outing.id });
    } catch {
      // User cancelled or sharing is unavailable.
    }
  }

  async function confirmReservation(booked: boolean) {
    const pending = pendingReservation;
    setPendingReservation(null);
    try { sessionStorage.removeItem(PENDING_KEY); } catch { /* Best effort. */ }
    if (!pending) return;

    const outingId = pending.outingId || activeOuting?.id || null;
    if (outingId && pending.locationId) {
      try {
        const response = await fetch("/api/outings/external-bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "decision",
            outingId,
            locationId: pending.locationId,
            decision: booked ? "confirmed" : "failed",
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.ok && data.summary) {
          setActiveOuting((current) => current ? persistActive({ ...current, summary: data.summary as BookingSummary }) : current);
        }
      } catch {
        // The 0411 follow-up can still resolve an external booking if the browser update fails.
      }
    }

    const eventName = booked ? "external_reservation_confirmed" : "external_reservation_not_completed";
    trackPlanEvent(eventName, { location_id: pending.locationId, location_name: pending.locationName, outing_id: outingId, returned_to_plan: true });
    trackGuided(eventName, { location_id: pending.locationId, location_name: pending.locationName, outing_id: outingId });
    setActionStatus(booked ? `${pending.locationName} marked confirmed.` : `${pending.locationName} still needs booking.`);
  }

  if (!plan || (!plan.restaurant && !plan.activity)) {
    return (
      <main className="min-h-screen bg-[#050505] px-4 py-10 text-white sm:px-6">
        <div className="mx-auto max-w-5xl">
          <GuidedJourneySteps activeStep={4} />
          <div className="mt-10 rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-7 text-center">
            <h1 className="text-3xl font-black">Your pick is missing.</h1>
            <p className="mt-2 text-sm font-semibold text-white/45">Go back and choose a plan so we can book your outing.</p>
            <Link href="/create" className="mt-5 inline-flex rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.1em]">Back to Planner</Link>
          </div>
        </div>
      </main>
    );
  }

  const remainingExternal = Math.max(0, bookingSummary.required - bookingSummary.confirmed);
  const remainingTotal = remainingExternal + internalRequiredCount;

  return (
    <main className="min-h-screen bg-[#050505] pb-16 text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.18),transparent_34%),linear-gradient(180deg,#050505_0%,#090706_100%)] px-4 pb-8 pt-8 sm:px-6 sm:pb-10 sm:pt-10">
        <div className="mx-auto max-w-6xl">
          <GuidedJourneySteps activeStep={4} className="mx-auto max-w-4xl" />
          <p className="mt-8 text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Step 4 of 4 · Book Plan</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-5xl">{outingReady ? "Your outing is ready." : bookingMode ? "Finish booking your plan." : "Book your plan."}</h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/50 sm:text-base">We save the outing first, then keep each booking together so you can see what is confirmed and what still needs attention.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(225,6,42,0.12),rgba(255,255,255,0.025))] p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff7188]">{outingReady ? "Ready" : bookingMode ? "Booking progress" : activeOuting ? "Saved plan" : "Next step"}</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.03em]">{outingReady ? "Everything we can verify is confirmed." : bookingMode ? `${remainingTotal} booking${remainingTotal === 1 ? "" : "s"} need attention` : "Save once. Book each stop."}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-white/50">
                {bookingMode
                  ? bookingSummary.required > 0
                    ? `${bookingSummary.confirmed} of ${bookingSummary.required} external booking${bookingSummary.required === 1 ? "" : "s"} confirmed${internalRequiredCount ? ` · ${internalRequiredCount} TheOutHaven reservation${internalRequiredCount === 1 ? "" : "s"} to complete` : ""}.`
                    : internalRequiredCount
                      ? `${internalRequiredCount} TheOutHaven reservation${internalRequiredCount === 1 ? "" : "s"} can be completed below.`
                      : "No reservation is required for these stops. Your saved outing is ready."
                  : "Book Plan creates the saved outing first. External booking clicks are tracked as started, never as confirmed."}
              </p>
              {actionStatus ? <p className="mt-3 text-xs font-bold text-white/65">{actionStatus}</p> : null}
            </div>

            <div className="flex flex-col gap-2 sm:min-w-64">
              <button type="button" onClick={() => void startBooking()} disabled={saving || bookingMode} className="rounded-full bg-[#e1062a] px-7 py-4 text-sm font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-red-950/30 transition hover:bg-[#ff1744] disabled:cursor-default disabled:bg-[#351016] disabled:text-white/65">
                {saving ? "Saving…" : bookingMode ? "✓ Booking Started" : "Book Plan →"}
              </button>
              <button type="button" onClick={() => void saveForLater()} disabled={saving || Boolean(activeOuting)} className="rounded-full border border-white/12 bg-white/[0.035] px-6 py-3 text-xs font-black uppercase tracking-[0.1em] text-white/70 transition hover:bg-white/[0.07] disabled:cursor-default disabled:text-white/35">
                {activeOuting ? "✓ Saved" : "Save for later"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {plan.restaurant ? (
            <PlaceCompletionCard
              location={plan.restaurant}
              type="restaurant"
              planTitle={title}
              outingId={activeOuting?.id || null}
              bookingEnabled={bookingMode}
              bookingStatus={bookingStatusFor(bookingSummary, plan.restaurant.id ? String(plan.restaurant.id) : null)}
              onRequestBookPlan={() => void startBooking()}
              onExternalReservation={(pending) => setPendingReservation(pending)}
            />
          ) : null}
          {plan.activity ? (
            <PlaceCompletionCard
              location={plan.activity}
              type="activity"
              planTitle={title}
              outingId={activeOuting?.id || null}
              bookingEnabled={bookingMode}
              bookingStatus={bookingStatusFor(bookingSummary, plan.activity.id ? String(plan.activity.id) : null)}
              onRequestBookPlan={() => void startBooking()}
              onExternalReservation={(pending) => setPendingReservation(pending)}
            />
          ) : null}
        </div>

        <div className="mt-6 rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a]">Keep your plan</p>
          <h2 className="mt-1 text-xl font-black">Take it with you.</h2>
          <p className="mt-1 text-sm font-semibold text-white/45">Text, email, or share the saved outing. These actions never mark a booking confirmed.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => { setShareMode("text"); setSmsConsent(false); setShareStatus(""); trackGuided("guided_plan_text_opened"); }} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-white/75">Text Plan</button>
            <button type="button" onClick={() => { setShareMode("email"); setSmsConsent(false); setShareStatus(""); trackGuided("guided_plan_email_opened"); }} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-white/75">Email Plan</button>
            <button type="button" onClick={() => void sharePlan()} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-white/75">Share</button>
          </div>
        </div>
      </section>

      {shareMode ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onMouseDown={(event) => { if (event.currentTarget === event.target) { setShareMode(null); setSmsConsent(false); } }}>
          <div className="w-full max-w-lg rounded-[1.5rem] border border-white/10 bg-[#0d0d0d] p-5 shadow-2xl shadow-black/70 sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Keep Your Plan</p><h2 className="mt-2 text-2xl font-black">{shareMode === "email" ? "Email this plan" : "Text this plan"}</h2></div><button type="button" onClick={() => { setShareMode(null); setSmsConsent(false); }} className="rounded-full border border-white/10 px-3 py-2 text-white/60">×</button></div>
            <input autoFocus type={shareMode === "email" ? "email" : "tel"} value={contact} onChange={(event) => setContact(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void sendPlan()} placeholder={shareMode === "email" ? "you@example.com" : "(555) 555-5555"} className="mt-5 h-14 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 font-semibold text-white outline-none focus:border-[#e1062a]/55" />
            {shareMode === "text" ? (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <input type="checkbox" checked={smsConsent} onChange={(event) => { setSmsConsent(event.target.checked); if (event.target.checked) setShareStatus(""); }} className="mt-0.5 h-4 w-4 shrink-0 accent-[#e1062a]" />
                <span className="text-xs font-semibold leading-5 text-white/50">
                  I agree to receive this outing plan and related outing text messages from TheOutHaven at the mobile number provided. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase. See our{" "}
                  <Link href="/sms-terms" target="_blank" className="font-bold text-white underline transition hover:text-[#e1062a]">SMS Terms</Link>{" "}
                  and{" "}<Link href="/privacy" target="_blank" className="font-bold text-white underline transition hover:text-[#e1062a]">Privacy Policy</Link>.
                </span>
              </label>
            ) : null}
            {shareStatus ? <p className="mt-3 text-sm font-bold text-white/65">{shareStatus}</p> : null}
            <button type="button" disabled={sending || (shareMode === "text" && !smsConsent)} onClick={() => void sendPlan()} className="mt-5 w-full rounded-full bg-[#e1062a] px-5 py-3.5 text-xs font-black uppercase tracking-[0.12em] disabled:cursor-not-allowed disabled:opacity-40">{sending ? "Sending…" : shareMode === "email" ? "Email My Plan" : "Text My Plan"}</button>
          </div>
        </div>
      ) : null}

      {pendingReservation ? (
        <div className="fixed inset-x-3 bottom-5 z-[90] mx-auto max-w-lg rounded-[1.35rem] border border-[#e1062a]/30 bg-[#111]/95 p-5 shadow-2xl shadow-black/70 backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a]">Back to your outing</p>
          <h3 className="mt-1 text-lg font-black">Did you book {pendingReservation.locationName}?</h3>
          <p className="mt-1 text-xs font-semibold text-white/45">Opening a reservation site never counts as a confirmation.</p>
          <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => void confirmReservation(true)} className="rounded-full bg-[#e1062a] px-4 py-3 text-xs font-black uppercase">Yes, booked</button><button type="button" onClick={() => void confirmReservation(false)} className="rounded-full border border-white/10 px-4 py-3 text-xs font-black uppercase text-white/70">Not yet</button></div>
        </div>
      ) : null}
    </main>
  );
}

function PlaceCompletionCard({
  location,
  type,
  planTitle,
  outingId,
  bookingEnabled,
  bookingStatus,
  onRequestBookPlan,
  onExternalReservation,
}: {
  location: PlanLocation;
  type: "restaurant" | "activity";
  planTitle: string;
  outingId: string | null;
  bookingEnabled: boolean;
  bookingStatus: string | null;
  onRequestBookPlan: () => void;
  onExternalReservation: (pending: PendingReservation) => void;
}) {
  const locationId = location.id ? String(location.id) : null;
  const name = getLocationName(location, type === "restaurant" ? "Restaurant" : "Activity");
  const image = getLocationImage(location as never);
  const externalReservation = getExternalReservationUrl(location as never);
  const internalReservation = getInternalReservationHref(location, type);
  const hasInternalReservation = Boolean((location.reservation_enabled || location.internal_reservations_enabled || location.uses_internal_reservations) && internalReservation);
  const directions = buildGooglePlaceDirectionsUrl({ destination: location, travelMode: "driving" });
  const phone = location.phone ? `tel:${String(location.phone).replace(/[^+\d]/g, "")}` : null;
  const details = detailHref(location, type);
  const primaryLabel = hasInternalReservation || externalReservation ? (type === "restaurant" ? "Reserve Table →" : "Book Activity →") : (type === "restaurant" ? "View Restaurant →" : "View Activity →");
  const internalHref = hasInternalReservation && internalReservation && outingId
    ? `${internalReservation}&outingId=${encodeURIComponent(outingId)}`
    : internalReservation;

  function record(action: string) {
    trackGuided(`guided_plan_${action}`, { location_id: locationId, location_type: type, outing_id: outingId });
    trackPlanEvent(`guided_plan_${action}`, { location_id: locationId, location_type: type, plan_title: planTitle, outing_id: outingId });
  }

  function reservationClick(external: boolean) {
    record("reservation_started");
    trackLocationAction(locationId, "reservation_started", { location_type: type, destination: external ? "external" : "theouthaven", outing_id: outingId });
    if (external) {
      const pending = { locationId, locationName: name, outingId };
      onExternalReservation(pending);
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...pending, startedAt: Date.now() }));
      } catch {
        // Best effort.
      }
    }
  }

  const statusLabel = bookingStatus === "confirmed"
    ? "Confirmed"
    : bookingStatus === "started"
      ? "Confirmation needed"
      : bookingStatus === "failed"
        ? "Not booked"
        : bookingStatus === "available"
          ? "Ready to book"
          : hasInternalReservation
            ? "Book with TheOutHaven"
            : null;

  return (
    <article className="overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#0b0b0b] shadow-xl shadow-black/30">
      <div className="relative h-48 bg-white/[0.04]">
        {image ? <Image src={image as string} alt={name} fill unoptimized sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" /> : <div className="flex h-full items-center justify-center text-4xl">{type === "restaurant" ? "🍽️" : "✨"}</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-black/20 to-transparent" />
        <span className="absolute left-4 top-4 rounded-full bg-black/75 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em]">{type === "restaurant" ? "Restaurant" : "Activity"}</span>
        {bookingEnabled && statusLabel ? <span className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/80 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-white/80">{statusLabel}</span> : null}
      </div>
      <div className="p-5">
        <h2 className="text-2xl font-black tracking-[-0.035em]">{name}</h2>
        <p className="mt-1 text-sm font-semibold text-white/45">{metaFor(location, type)}</p>

        <div className="mt-5 flex items-center gap-2">
          {!bookingEnabled && (hasInternalReservation || externalReservation) ? (
            <button type="button" onClick={onRequestBookPlan} className="flex-1 rounded-full bg-[#e1062a] px-5 py-3.5 text-center text-xs font-black uppercase tracking-[0.1em] hover:bg-[#ff1744]">Book Plan First →</button>
          ) : bookingStatus === "confirmed" ? (
            <button type="button" disabled className="flex-1 rounded-full bg-emerald-600/20 px-5 py-3.5 text-center text-xs font-black uppercase tracking-[0.1em] text-emerald-300">✓ Confirmed</button>
          ) : hasInternalReservation && internalHref ? (
            <Link href={internalHref} onClick={() => reservationClick(false)} className="flex-1 rounded-full bg-[#e1062a] px-5 py-3.5 text-center text-xs font-black uppercase tracking-[0.1em] hover:bg-[#ff1744]">{primaryLabel}</Link>
          ) : externalReservation ? (
            <a href={trackedOutbound(externalReservation, "reservation", location, type, planTitle, outingId)} target="_blank" rel="noopener noreferrer" onClick={() => reservationClick(true)} className="flex-1 rounded-full bg-[#e1062a] px-5 py-3.5 text-center text-xs font-black uppercase tracking-[0.1em] hover:bg-[#ff1744]">{bookingStatus === "failed" ? "Try Booking Again →" : primaryLabel}</a>
          ) : (
            <Link href={details} onClick={() => record("details_clicked")} className="flex-1 rounded-full bg-[#e1062a] px-5 py-3.5 text-center text-xs font-black uppercase tracking-[0.1em] hover:bg-[#ff1744]">{primaryLabel}</Link>
          )}

          <details className="relative">
            <summary onClick={() => record("more_opened")} className="cursor-pointer list-none rounded-full border border-white/10 bg-white/[0.04] px-5 py-3.5 text-xs font-black uppercase tracking-[0.1em] text-white/70">More ▾</summary>
            <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-white/10 bg-[#151515] p-2 shadow-2xl shadow-black/70">
              {(hasInternalReservation || externalReservation) ? <Link href={details} onClick={() => record("details_clicked")} className="block rounded-xl px-3 py-2.5 text-sm font-bold text-white/70 hover:bg-white/[0.05] hover:text-white">Details</Link> : null}
              {directions ? <a href={trackedOutbound(directions, "directions", location, type, planTitle, outingId)} target="_blank" rel="noopener noreferrer" onClick={() => { record("directions_clicked"); trackLocationAction(locationId, "directions_click", { location_type: type, outing_id: outingId }); }} className="block rounded-xl px-3 py-2.5 text-sm font-bold text-white/70 hover:bg-white/[0.05] hover:text-white">Directions</a> : null}
              {location.website ? <a href={trackedOutbound(String(location.website), "website", location, type, planTitle, outingId)} target="_blank" rel="noopener noreferrer" onClick={() => { record("website_clicked"); trackLocationAction(locationId, "website_click", { location_type: type, outing_id: outingId }); }} className="block rounded-xl px-3 py-2.5 text-sm font-bold text-white/70 hover:bg-white/[0.05] hover:text-white">Website</a> : null}
              {phone ? <a href={trackedOutbound(phone, "phone", location, type, planTitle, outingId)} onClick={() => { record("phone_clicked"); trackLocationAction(locationId, "phone_click", { location_type: type, outing_id: outingId }); }} className="block rounded-xl px-3 py-2.5 text-sm font-bold text-white/70 hover:bg-white/[0.05] hover:text-white">Call</a> : null}
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}
