"use client";

import { useEffect, useMemo, useState } from "react";
import { getLocationName } from "@/lib/locationName";

type PlanLocation = {
  id?: string | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
  city?: string | null;
  website?: string | null;
  phone?: string | null;
};

type SavedPlan = {
  restaurant?: PlanLocation | null;
  activity?: PlanLocation | null;
  outingTime?: {
    plannedFor?: string | null;
    timezone?: string | null;
    outingDateContext?: string | null;
    outingTimeConfidence?: "none" | "date_only" | "exact";
    remindersEnabled?: boolean;
    outingDateLabel?: string | null;
    outingTimeLabel?: string | null;
    outingDateTimeText?: string | null;
  } | null;
};

type PendingReservation = {
  locationId: string | null;
  locationName: string;
  startedAt: number;
};

const PLAN_KEY = "theouthaven_plan";
const PENDING_RESERVATION_KEY = "theouthaven_pending_external_reservation";

function loadPlan(): SavedPlan | null {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    return raw ? (JSON.parse(raw) as SavedPlan) : null;
  } catch {
    return null;
  }
}

function planTitle(plan: SavedPlan | null) {
  if (!plan) return "Your TheOutHaven Plan";
  const names = [
    plan.restaurant ? getLocationName(plan.restaurant, "") : "",
    plan.activity ? getLocationName(plan.activity, "") : "",
  ].filter(Boolean);
  return names.length ? names.join(" + ") : "Your TheOutHaven Plan";
}

function primaryLocation(plan: SavedPlan | null) {
  return plan?.restaurant || plan?.activity || null;
}

export default function PlanContinuityOverlay() {
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [shareMode, setShareMode] = useState<"email" | "text" | null>(null);
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingReservation, setPendingReservation] = useState<PendingReservation | null>(null);

  useEffect(() => {
    const refreshPlan = () => setPlan(loadPlan());
    refreshPlan();
    window.addEventListener("storage", refreshPlan);
    const timer = window.setInterval(refreshPlan, 1500);
    return () => {
      window.removeEventListener("storage", refreshPlan);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function readPendingReservation() {
      try {
        const raw = sessionStorage.getItem(PENDING_RESERVATION_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as PendingReservation;
        if (Date.now() - parsed.startedAt < 1000 * 60 * 60 * 6) {
          setPendingReservation(parsed);
        } else {
          sessionStorage.removeItem(PENDING_RESERVATION_KEY);
        }
      } catch {
        // Ignore malformed continuity state.
      }
    }

    function captureExternalReservation(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.origin);
      } catch {
        return;
      }
      if (!url.pathname.includes("/api/track/outbound")) return;
      if (url.searchParams.get("type") !== "reservation") return;

      const currentPlan = loadPlan();
      const restaurant = currentPlan?.restaurant || null;
      const activity = currentPlan?.activity || null;
      const locationId = url.searchParams.get("locationId");
      const matched =
        (restaurant?.id && String(restaurant.id) === locationId ? restaurant : null) ||
        (activity?.id && String(activity.id) === locationId ? activity : null) ||
        restaurant ||
        activity;
      const pending: PendingReservation = {
        locationId,
        locationName: matched ? getLocationName(matched, "this location") : "this location",
        startedAt: Date.now(),
      };
      sessionStorage.setItem(PENDING_RESERVATION_KEY, JSON.stringify(pending));
    }

    document.addEventListener("click", captureExternalReservation, true);
    window.addEventListener("focus", readPendingReservation);
    document.addEventListener("visibilitychange", readPendingReservation);
    readPendingReservation();

    return () => {
      document.removeEventListener("click", captureExternalReservation, true);
      window.removeEventListener("focus", readPendingReservation);
      document.removeEventListener("visibilitychange", readPendingReservation);
    };
  }, []);

  const title = useMemo(() => planTitle(plan), [plan]);
  const primary = primaryLocation(plan);

  async function sendPlan() {
    if (!shareMode || !plan || !primary?.id) return;
    if (!contact.trim()) {
      setStatus(shareMode === "email" ? "Enter an email address." : "Enter a mobile number.");
      return;
    }

    setSending(true);
    setStatus(shareMode === "email" ? "Emailing your plan…" : "Texting your plan…");

    try {
      const timing = plan.outingTime || {};
      const response = await fetch("/api/outings/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: String(primary.id),
          restaurantLocationId: plan.restaurant?.id ? String(plan.restaurant.id) : null,
          activityLocationId: plan.activity?.id ? String(plan.activity.id) : null,
          source: "plan_share",
          sourceQuery: title,
          page_path: "/plan",
          planTitle: title,
          selectedLocations: {
            restaurant: plan.restaurant || null,
            activity: plan.activity || null,
          },
          plannedFor: timing.plannedFor || null,
          timezone: timing.timezone || "America/New_York",
          outingDateContext: timing.outingDateContext || null,
          outingTimeConfidence: timing.outingTimeConfidence || "none",
          remindersEnabled: Boolean(timing.remindersEnabled),
          outingTiming: {
            outingDateLabel: timing.outingDateLabel || null,
            outingTimeLabel: timing.outingTimeLabel || null,
            outingDateTimeText: timing.outingDateTimeText || null,
            outingTimeConfidence: timing.outingTimeConfidence || "none",
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
        setStatus(data.message || "We could not send your plan yet.");
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
          setStatus(textData.message || "Your plan was saved, but the text could not be sent.");
          return;
        }
      }

      setStatus(shareMode === "email" ? "Plan sent to your email." : "Plan sent by text.");
      window.setTimeout(() => {
        setShareMode(null);
        setContact("");
        setStatus("");
      }, 1800);
    } catch {
      setStatus("We could not send your plan yet.");
    } finally {
      setSending(false);
    }
  }

  async function confirmExternalReservation(booked: boolean) {
    const pending = pendingReservation;
    setPendingReservation(null);
    sessionStorage.removeItem(PENDING_RESERVATION_KEY);
    if (!pending) return;

    try {
      await fetch("/api/analytics/plan-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          event_name: booked ? "external_reservation_confirmed" : "external_reservation_not_completed",
          event_type: "plan_click",
          conversion_step: booked ? "external_reservation_confirmed" : "external_reservation_returned",
          location_id: pending.locationId,
          source_location_id: pending.locationId,
          page_path: "/plan",
          source: "plan_page",
          metadata: {
            location_name: pending.locationName,
            returned_to_plan: true,
          },
        }),
      });
    } catch {
      // Analytics must not block the return flow.
    }

    if (booked) {
      try {
        const key = "theouthaven_external_booking_confirmations";
        const raw = localStorage.getItem(key);
        const current = raw ? JSON.parse(raw) : {};
        current[pending.locationId || pending.locationName] = {
          booked: true,
          locationName: pending.locationName,
          confirmedAt: Date.now(),
        };
        localStorage.setItem(key, JSON.stringify(current));
      } catch {
        // Local confirmation is best effort.
      }
    }
  }

  if (!plan || !primary) return null;

  return (
    <>
      <div className="fixed bottom-4 left-1/2 z-[80] flex w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 items-center gap-2 rounded-[1.25rem] border border-white/10 bg-[#111]/95 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl sm:bottom-5 sm:w-auto sm:max-w-none sm:rounded-full">
        <button type="button" onClick={() => { setShareMode("text"); setStatus(""); }} className="flex-1 rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-white/80 transition hover:border-[#e1062a]/45 hover:text-white sm:flex-none">Text Plan</button>
        <button type="button" onClick={() => { setShareMode("email"); setStatus(""); }} className="flex-1 rounded-full bg-[#e1062a] px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#ff1744] sm:flex-none">Email Plan</button>
      </div>

      {shareMode ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onMouseDown={(event) => { if (event.currentTarget === event.target) setShareMode(null); }}>
          <div className="w-full max-w-lg rounded-[1.5rem] border border-white/10 bg-[#0d0d0d] p-5 shadow-2xl shadow-black/70 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Keep Your Plan</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">{shareMode === "email" ? "Email this plan to me" : "Text this plan to me"}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-white/45">We’ll save a secure plan link so you can come back to the same outing.</p>
              </div>
              <button type="button" onClick={() => setShareMode(null)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-black text-white/60">×</button>
            </div>
            <label className="mt-5 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{shareMode === "email" ? "Email address" : "Mobile number"}</label>
            <input autoFocus type={shareMode === "email" ? "email" : "tel"} value={contact} onChange={(event) => setContact(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void sendPlan()} placeholder={shareMode === "email" ? "you@example.com" : "(555) 555-5555"} className="mt-2 h-14 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 font-semibold text-white outline-none transition placeholder:text-white/25 focus:border-[#e1062a]/55" />
            {status ? <p className="mt-3 text-sm font-bold text-white/65">{status}</p> : null}
            <button type="button" disabled={sending} onClick={() => void sendPlan()} className="mt-5 w-full rounded-full bg-[#e1062a] px-5 py-3.5 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#ff1744] disabled:opacity-50">{sending ? "Sending…" : shareMode === "email" ? "Email My Plan" : "Text My Plan"}</button>
          </div>
        </div>
      ) : null}

      {pendingReservation ? (
        <div className="fixed inset-x-3 bottom-24 z-[90] mx-auto max-w-lg rounded-[1.35rem] border border-[#e1062a]/30 bg-[#111]/95 p-4 shadow-2xl shadow-black/70 backdrop-blur-xl sm:bottom-24 sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a]">Back to your plan</p>
          <h3 className="mt-1 text-lg font-black text-white">Did you book {pendingReservation.locationName}?</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-white/45">Confirming keeps your outing progress together. We won’t assume an external booking completed.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void confirmExternalReservation(true)} className="rounded-full bg-[#e1062a] px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-white">Yes, booked</button>
            <button type="button" onClick={() => void confirmExternalReservation(false)} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-white/70">Not yet</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
