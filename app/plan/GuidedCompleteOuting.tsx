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

type ShareMode = "text" | "email" | null;
type PendingReservation = { locationId: string | null; locationName: string };

const PLAN_KEY = "theouthaven_plan";
const PENDING_KEY = "theouthaven_pending_external_reservation";

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
      source_section: "guided_complete_outing",
      metadata,
    }),
  }).catch(() => undefined);
}

function trackedOutbound(to: string, type: "reservation" | "phone" | "website" | "directions", location: PlanLocation, locationType: "restaurant" | "activity", planTitle: string) {
  const params = new URLSearchParams({
    to,
    type,
    locationType,
    source: "guided_plan_page",
    planTitle,
  });
  if (location.id) params.set("locationId", String(location.id));
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

export default function GuidedCompleteOuting() {
  const searchParams = useSearchParams();
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [shareMode, setShareMode] = useState<ShareMode>(null);
  const [contact, setContact] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [pendingReservation, setPendingReservation] = useState<PendingReservation | null>(null);

  useEffect(() => {
    document.title = "Complete Your Outing | TheOutHaven";
    const saved = loadPlan();
    setPlan(saved);
    try {
      setCompleted(localStorage.getItem("theouthaven_guided_outing_completed") === "true");
    } catch {
      setCompleted(false);
    }
    trackGuided("planner_complete_outing_viewed", {
      has_restaurant: Boolean(saved?.restaurant),
      has_activity: Boolean(saved?.activity),
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

  const title = useMemo(() => {
    const names = [
      plan?.restaurant ? getLocationName(plan.restaurant, "") : "",
      plan?.activity ? getLocationName(plan.activity, "") : "",
    ].filter(Boolean);
    return names.length ? names.join(" + ") : "Your TheOutHaven Plan";
  }, [plan]);

  async function sendPlan() {
    if (!shareMode || !plan) return;
    const primary = primaryLocation(plan);
    if (!primary?.id) return;
    if (!contact.trim()) {
      setShareStatus(shareMode === "email" ? "Enter an email address." : "Enter a mobile number.");
      return;
    }
    setSending(true);
    setShareStatus(shareMode === "email" ? "Emailing your plan…" : "Texting your plan…");
    const timing = plan.outingTime || {};
    try {
      const response = await fetch("/api/outings/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: String(primary.id),
          restaurantLocationId: plan.restaurant?.id ? String(plan.restaurant.id) : null,
          activityLocationId: plan.activity?.id ? String(plan.activity.id) : null,
          source: "guided_plan_share",
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
          guestEmail: shareMode === "email" ? contact.trim() : null,
          guestPhone: shareMode === "text" ? contact.trim() : null,
          contact_method: shareMode,
          emailOptIn: shareMode === "email",
          smsOptIn: shareMode === "text",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        setShareStatus(data.message || "We could not send your plan yet.");
        return;
      }
      if (shareMode === "text") {
        const textResponse = await fetch("/api/outings/text-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: contact.trim(),
            planTitle: title,
            planUrl: data.planUrl,
            restaurantName: plan.restaurant ? getLocationName(plan.restaurant, "") : null,
            activityName: plan.activity ? getLocationName(plan.activity, "") : null,
          }),
        });
        const textData = await textResponse.json().catch(() => ({}));
        if (!textResponse.ok || !textData.ok) {
          setShareStatus(textData.message || "Your plan was saved, but the text could not be sent.");
          return;
        }
      }
      const eventName = shareMode === "email" ? "guided_plan_emailed" : "guided_plan_texted";
      trackGuided(eventName, { plan_title: title });
      trackPlanEvent(eventName, { plan_title: title });
      setShareStatus(shareMode === "email" ? "Plan sent to your email." : "Plan sent by text.");
      window.setTimeout(() => {
        setShareMode(null);
        setContact("");
        setShareStatus("");
      }, 1600);
    } catch {
      setShareStatus("We could not send your plan yet.");
    } finally {
      setSending(false);
    }
  }

  async function sharePlan() {
    const text = `${title} — TheOutHaven`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "My TheOutHaven Plan", text, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(window.location.href);
      }
      trackGuided("guided_plan_shared", { plan_title: title });
      trackPlanEvent("guided_plan_shared", { plan_title: title });
    } catch {
      // User cancelled or sharing is unavailable.
    }
  }

  function completeOuting() {
    try {
      localStorage.setItem("theouthaven_guided_outing_completed", "true");
    } catch {
      // Local completion is best effort.
    }
    setCompleted(true);
    trackGuided("planner_outing_completed", {
      has_restaurant: Boolean(plan?.restaurant),
      has_activity: Boolean(plan?.activity),
    });
    trackPlanEvent("planner_outing_completed", { plan_title: title });
  }

  async function confirmReservation(booked: boolean) {
    const pending = pendingReservation;
    setPendingReservation(null);
    sessionStorage.removeItem(PENDING_KEY);
    if (!pending) return;
    const eventName = booked ? "external_reservation_confirmed" : "external_reservation_not_completed";
    trackPlanEvent(eventName, {
      location_id: pending.locationId,
      location_name: pending.locationName,
      returned_to_plan: true,
    });
    trackGuided(eventName, {
      location_id: pending.locationId,
      location_name: pending.locationName,
    });
  }

  if (!plan || (!plan.restaurant && !plan.activity)) {
    return (
      <main className="min-h-screen bg-[#050505] px-4 py-10 text-white sm:px-6">
        <div className="mx-auto max-w-5xl">
          <GuidedJourneySteps activeStep={4} />
          <div className="mt-10 rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-7 text-center">
            <h1 className="text-3xl font-black">Your pick is missing.</h1>
            <p className="mt-2 text-sm font-semibold text-white/45">Go back and choose a plan so we can complete your outing.</p>
            <Link href="/create" className="mt-5 inline-flex rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.1em]">Back to Planner</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505] pb-16 text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.18),transparent_34%),linear-gradient(180deg,#050505_0%,#090706_100%)] px-4 pb-8 pt-8 sm:px-6 sm:pb-10 sm:pt-10">
        <div className="mx-auto max-w-6xl">
          <GuidedJourneySteps activeStep={4} className="mx-auto max-w-4xl" />
          <p className="mt-8 text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Step 4 of 4 · Complete Outing</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-5xl">{completed ? "Your outing is ready." : "Complete your outing."}</h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/50 sm:text-base">Your picks are set. Book what needs booking, keep the plan handy, and use More only when you need the extra venue tools.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid gap-5 lg:grid-cols-2">
          {plan.restaurant ? <PlaceCompletionCard location={plan.restaurant} type="restaurant" planTitle={title} onExternalReservation={(pending) => setPendingReservation(pending)} /> : null}
          {plan.activity ? <PlaceCompletionCard location={plan.activity} type="activity" planTitle={title} onExternalReservation={(pending) => setPendingReservation(pending)} /> : null}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a]">Keep your plan</p>
            <h2 className="mt-1 text-xl font-black">Take it with you.</h2>
            <p className="mt-1 text-sm font-semibold text-white/45">These actions affect the whole outing, not an individual venue.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setShareMode("text"); setShareStatus(""); trackGuided("guided_plan_text_opened"); }} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-white/75">Text Plan</button>
              <button type="button" onClick={() => { setShareMode("email"); setShareStatus(""); trackGuided("guided_plan_email_opened"); }} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-white/75">Email Plan</button>
              <button type="button" onClick={() => void sharePlan()} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-white/75">Share</button>
            </div>
          </div>

          <button type="button" onClick={completeOuting} disabled={completed} className="min-w-56 rounded-full bg-[#e1062a] px-7 py-4 text-sm font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-red-950/30 transition hover:bg-[#ff1744] disabled:bg-emerald-600 disabled:opacity-100">{completed ? "✓ Outing Complete" : "Complete Outing →"}</button>
        </div>
      </section>

      {shareMode ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onMouseDown={(event) => { if (event.currentTarget === event.target) setShareMode(null); }}>
          <div className="w-full max-w-lg rounded-[1.5rem] border border-white/10 bg-[#0d0d0d] p-5 shadow-2xl shadow-black/70 sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Keep Your Plan</p><h2 className="mt-2 text-2xl font-black">{shareMode === "email" ? "Email this plan" : "Text this plan"}</h2></div><button type="button" onClick={() => setShareMode(null)} className="rounded-full border border-white/10 px-3 py-2 text-white/60">×</button></div>
            <input autoFocus type={shareMode === "email" ? "email" : "tel"} value={contact} onChange={(event) => setContact(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void sendPlan()} placeholder={shareMode === "email" ? "you@example.com" : "(555) 555-5555"} className="mt-5 h-14 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 font-semibold text-white outline-none focus:border-[#e1062a]/55" />
            {shareStatus ? <p className="mt-3 text-sm font-bold text-white/65">{shareStatus}</p> : null}
            <button type="button" disabled={sending} onClick={() => void sendPlan()} className="mt-5 w-full rounded-full bg-[#e1062a] px-5 py-3.5 text-xs font-black uppercase tracking-[0.12em] disabled:opacity-50">{sending ? "Sending…" : shareMode === "email" ? "Email My Plan" : "Text My Plan"}</button>
          </div>
        </div>
      ) : null}

      {pendingReservation ? (
        <div className="fixed inset-x-3 bottom-5 z-[90] mx-auto max-w-lg rounded-[1.35rem] border border-[#e1062a]/30 bg-[#111]/95 p-5 shadow-2xl shadow-black/70 backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a]">Back to your outing</p>
          <h3 className="mt-1 text-lg font-black">Did you book {pendingReservation.locationName}?</h3>
          <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => void confirmReservation(true)} className="rounded-full bg-[#e1062a] px-4 py-3 text-xs font-black uppercase">Yes, booked</button><button type="button" onClick={() => void confirmReservation(false)} className="rounded-full border border-white/10 px-4 py-3 text-xs font-black uppercase text-white/70">Not yet</button></div>
        </div>
      ) : null}
    </main>
  );
}

function PlaceCompletionCard({ location, type, planTitle, onExternalReservation }: { location: PlanLocation; type: "restaurant" | "activity"; planTitle: string; onExternalReservation: (pending: PendingReservation) => void }) {
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

  function record(action: string) {
    trackGuided(`guided_plan_${action}`, { location_id: locationId, location_type: type });
    trackPlanEvent(`guided_plan_${action}`, { location_id: locationId, location_type: type, plan_title: planTitle });
  }

  function reservationClick(external: boolean) {
    record("reservation_started");
    trackLocationAction(locationId, "reservation_started", { location_type: type, destination: external ? "external" : "theouthaven" });
    if (external) {
      const pending = { locationId, locationName: name };
      onExternalReservation(pending);
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...pending, startedAt: Date.now() }));
      } catch {
        // Best effort.
      }
    }
  }

  return (
    <article className="overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#0b0b0b] shadow-xl shadow-black/30">
      <div className="relative h-48 bg-white/[0.04]">
        {image ? <Image src={image as string} alt={name} fill unoptimized sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" /> : <div className="flex h-full items-center justify-center text-4xl">{type === "restaurant" ? "🍽️" : "✨"}</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-black/20 to-transparent" />
        <span className="absolute left-4 top-4 rounded-full bg-black/75 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em]">{type === "restaurant" ? "Restaurant" : "Activity"}</span>
      </div>
      <div className="p-5">
        <h2 className="text-2xl font-black tracking-[-0.035em]">{name}</h2>
        <p className="mt-1 text-sm font-semibold text-white/45">{metaFor(location, type)}</p>

        <div className="mt-5 flex items-center gap-2">
          {hasInternalReservation && internalReservation ? (
            <Link href={internalReservation} onClick={() => reservationClick(false)} className="flex-1 rounded-full bg-[#e1062a] px-5 py-3.5 text-center text-xs font-black uppercase tracking-[0.1em] hover:bg-[#ff1744]">{primaryLabel}</Link>
          ) : externalReservation ? (
            <a href={trackedOutbound(externalReservation, "reservation", location, type, planTitle)} target="_blank" rel="noopener noreferrer" onClick={() => reservationClick(true)} className="flex-1 rounded-full bg-[#e1062a] px-5 py-3.5 text-center text-xs font-black uppercase tracking-[0.1em] hover:bg-[#ff1744]">{primaryLabel}</a>
          ) : (
            <Link href={details} onClick={() => record("details_clicked")} className="flex-1 rounded-full bg-[#e1062a] px-5 py-3.5 text-center text-xs font-black uppercase tracking-[0.1em] hover:bg-[#ff1744]">{primaryLabel}</Link>
          )}

          <details className="relative">
            <summary onClick={() => record("more_opened")} className="cursor-pointer list-none rounded-full border border-white/10 bg-white/[0.04] px-5 py-3.5 text-xs font-black uppercase tracking-[0.1em] text-white/70">More ▾</summary>
            <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-white/10 bg-[#151515] p-2 shadow-2xl shadow-black/70">
              {!(!hasInternalReservation && !externalReservation) ? <Link href={details} onClick={() => record("details_clicked")} className="block rounded-xl px-3 py-2.5 text-sm font-bold text-white/70 hover:bg-white/[0.05] hover:text-white">Details</Link> : null}
              {directions ? <a href={trackedOutbound(directions, "directions", location, type, planTitle)} target="_blank" rel="noopener noreferrer" onClick={() => { record("directions_clicked"); trackLocationAction(locationId, "directions_click", { location_type: type }); }} className="block rounded-xl px-3 py-2.5 text-sm font-bold text-white/70 hover:bg-white/[0.05] hover:text-white">Directions</a> : null}
              {location.website ? <a href={trackedOutbound(String(location.website), "website", location, type, planTitle)} target="_blank" rel="noopener noreferrer" onClick={() => { record("website_clicked"); trackLocationAction(locationId, "website_click", { location_type: type }); }} className="block rounded-xl px-3 py-2.5 text-sm font-bold text-white/70 hover:bg-white/[0.05] hover:text-white">Website</a> : null}
              {phone ? <a href={trackedOutbound(phone, "phone", location, type, planTitle)} onClick={() => { record("phone_clicked"); trackLocationAction(locationId, "phone_click", { location_type: type }); }} className="block rounded-xl px-3 py-2.5 text-sm font-bold text-white/70 hover:bg-white/[0.05] hover:text-white">Call</a> : null}
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}
