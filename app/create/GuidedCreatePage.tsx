"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trackClientEvent } from "@/lib/analytics/trackClientEvent";
import { detectRequestedGeo } from "@/lib/search/geo-matching";
import GuidedJourneySteps from "@/components/planner/GuidedJourneySteps";

type PlanType = "outing" | "restaurant" | "activity";
type LocationSource = "search" | "manual" | "device" | null;

const LOCATION_KEY = "theouthaven_user_location";
const FLOW_VERSION = "guided_create_v1";
const JOURNEY_VERSION = "four_step";

const typingSearches = [
  "Steak dinner and rooftop drinks in Manhattan",
  "Italian dinner with live music in Brooklyn",
  "Birthday dinner and bowling in Queens",
  "Girls night with cocktails in Brooklyn",
  "Brunch and an activity nearby",
  "Dinner and hookah at the same location",
  "Seafood dinner with jazz after",
  "Walking distance restaurant and activity",
];

const planTypes: Array<{
  id: PlanType;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    id: "outing",
    label: "Restaurant + Activity",
    description: "Build a complete outing with food, drinks, and something to do.",
    icon: "✨",
  },
  {
    id: "restaurant",
    label: "Restaurant",
    description: "Find the right place to eat, brunch, or grab drinks.",
    icon: "🍽️",
  },
  {
    id: "activity",
    label: "Activity",
    description: "Find something fun to do on its own.",
    icon: "🎳",
  },
];

const whenChoices = [
  "Today",
  "Tonight",
  "Tomorrow",
  "This weekend",
  "No specific time",
];

const preferenceChoices = [
  "Romantic",
  "Casual",
  "Upscale",
  "Lively",
  "Rooftop",
  "Cocktails",
  "Walking distance",
  "Budget friendly",
  "Outdoor",
  "Family friendly",
];

function safelyTrack(eventName: string, metadata: Record<string, unknown>) {
  try {
    trackClientEvent({
      event_name: eventName,
      source: "guided_create",
      metadata,
    });
  } catch {
    // Analytics must never block the planner.
  }
}

function titleCaseLocation(value: string) {
  return value
    .replaceAll("_", " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getLocationFromSearch(query: string) {
  const geo = detectRequestedGeo(query);
  if (!geo) return "";
  const value =
    geo.neighborhood ||
    geo.area ||
    geo.borough ||
    geo.city ||
    geo.county ||
    geo.areaGroup ||
    geo.region ||
    geo.terms?.[0] ||
    "";
  return value ? titleCaseLocation(value) : "";
}

function getLocalDateValue(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getThisWeekendDateValue() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  const daysUntilSaturday = day === 6 ? 0 : day === 0 ? 6 : 6 - day;
  date.setDate(date.getDate() + daysUntilSaturday);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dateOfMonth = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dateOfMonth}`;
}

export default function GuidedCreatePage() {
  const router = useRouter();
  const makeItYoursRef = useRef<HTMLElement | null>(null);
  const [activeStep, setActiveStep] = useState<1 | 2>(1);
  const [planType, setPlanType] = useState<PlanType>("outing");
  const [idea, setIdea] = useState("");
  const [location, setLocation] = useState("");
  const [locationSource, setLocationSource] = useState<LocationSource>(null);
  const [when, setWhen] = useState("No specific time");
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [typedPlaceholder, setTypedPlaceholder] = useState(typingSearches[0]);
  const [locationSaved, setLocationSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Create Your Outing | TheOutHaven";
    safelyTrack("planner_started", {
      step: 1,
      flow_version: FLOW_VERSION,
      journey_version: JOURNEY_VERSION,
    });
    try {
      setLocationSaved(Boolean(localStorage.getItem(LOCATION_KEY)));
    } catch {
      setLocationSaved(false);
    }
  }, []);

  useEffect(() => {
    let searchIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timeout: ReturnType<typeof setTimeout>;
    function typeLoop() {
      const current = typingSearches[searchIndex];
      if (!deleting) {
        setTypedPlaceholder(current.slice(0, charIndex + 1));
        charIndex += 1;
        if (charIndex === current.length) {
          deleting = true;
          timeout = setTimeout(typeLoop, 1300);
          return;
        }
      } else {
        setTypedPlaceholder(current.slice(0, charIndex - 1));
        charIndex -= 1;
        if (charIndex === 0) {
          deleting = false;
          searchIndex = (searchIndex + 1) % typingSearches.length;
          timeout = setTimeout(typeLoop, 260);
          return;
        }
      }
      timeout = setTimeout(typeLoop, deleting ? 32 : 55);
    }
    typeLoop();
    return () => clearTimeout(timeout);
  }, []);

  const summary = useMemo(() => {
    const typeLabel =
      planTypes.find((item) => item.id === planType)?.label || "Outing";
    return [
      typeLabel,
      location.trim() || (locationSaved ? "Near me" : null),
      customDate || (when !== "No specific time" ? when : null),
      customTime || null,
      ...preferences.slice(0, 3),
    ].filter(Boolean) as string[];
  }, [customDate, customTime, location, locationSaved, planType, preferences, when]);

  function requestUserLocation() {
    if (!navigator.geolocation) {
      setError("Location is not supported on this device. Enter a neighborhood, city, or ZIP instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        localStorage.setItem(
          LOCATION_KEY,
          JSON.stringify({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        );
        setLocationSaved(true);
        setLocation("");
        setLocationSource("device");
        setError("");
      },
      () => setError("We could not access your location. Enter a neighborhood, city, or ZIP instead."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  function togglePreference(value: string) {
    setPreferences((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  function selectWhen(value: string) {
    setWhen(value);
    if (value === "Today" || value === "Tonight") {
      setCustomDate(getLocalDateValue(0));
    } else if (value === "Tomorrow") {
      setCustomDate(getLocalDateValue(1));
    } else if (value === "This weekend") {
      setCustomDate(getThisWeekendDateValue());
    } else {
      setCustomDate("");
      setCustomTime("");
    }
  }

  function continueToMakeItYours() {
    if (!idea.trim()) {
      setError("Describe what you have in mind in a sentence so we can build your plan.");
      return;
    }
    const detectedLocation = getLocationFromSearch(idea.trim());
    if (detectedLocation) {
      setLocation(detectedLocation);
      setLocationSaved(false);
      setLocationSource("search");
    } else if (locationSource === "search") {
      setLocation("");
      setLocationSource(null);
    }
    setError("");
    setActiveStep(2);
    safelyTrack("planner_intent_completed", {
      step: 1,
      plan_type: planType,
      idea: idea.trim(),
      location_from_search: detectedLocation || null,
      flow_version: FLOW_VERSION,
      journey_version: JOURNEY_VERSION,
    });
    safelyTrack("planner_make_it_yours_viewed", {
      step: 2,
      plan_type: planType,
      flow_version: FLOW_VERSION,
      journey_version: JOURNEY_VERSION,
    });
    window.setTimeout(() => {
      makeItYoursRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 20);
  }

  function buildPrompt() {
    const typeInstruction =
      planType === "restaurant"
        ? "restaurant only"
        : planType === "activity"
          ? "activity only"
          : "restaurant and activity outing";
    const whereText = location.trim() || "near me";
    const timing = [
      customDate || (when !== "No specific time" ? when : null),
      customTime || null,
    ]
      .filter(Boolean)
      .join(" ");
    return [
      `Plan a ${typeInstruction}.`,
      idea.trim(),
      `Location: ${whereText}.`,
      timing ? `When: ${timing}.` : "",
      preferences.length ? `Preferences: ${preferences.join(", ")}.` : "",
      notes.trim() ? `Also: ${notes.trim()}.` : "",
      "Return the best options, ranked by fit.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function showPicks() {
    if (!location.trim() && !locationSaved) {
      setError("Add an area or use your current location so we know where to plan.");
      return;
    }
    const locationMode =
      locationSource === "search"
        ? "search_query"
        : locationSaved || locationSource === "device"
          ? "current_location"
          : "typed";
    safelyTrack("planner_where_when_completed", {
      step: 2,
      plan_type: planType,
      location_mode: locationMode,
      when,
      custom_date: customDate || null,
      custom_time: customTime || null,
      flow_version: FLOW_VERSION,
      journey_version: JOURNEY_VERSION,
    });
    safelyTrack("planner_preferences_completed", {
      step: 2,
      plan_type: planType,
      preferences,
      has_notes: Boolean(notes.trim()),
      flow_version: FLOW_VERSION,
      journey_version: JOURNEY_VERSION,
    });
    safelyTrack("planner_make_it_yours_completed", {
      step: 2,
      plan_type: planType,
      location_mode: locationMode,
      preference_count: preferences.length,
      has_exact_date: Boolean(customDate),
      has_exact_time: Boolean(customTime),
      flow_version: FLOW_VERSION,
      journey_version: JOURNEY_VERSION,
    });
    safelyTrack("planner_generate_clicked", {
      plan_type: planType,
      preference_count: preferences.length,
      next_step: 3,
      flow_version: FLOW_VERSION,
      journey_version: JOURNEY_VERSION,
    });

    const params = new URLSearchParams({
      guided: "results",
      planType,
      prompt: buildPrompt(),
      guidedFlow: FLOW_VERSION,
      journey: JOURNEY_VERSION,
    });
    router.push(`/create?${params.toString()}`);
  }

  return (
    <main className="min-h-screen bg-[#050505] pb-16 text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.2),transparent_32%),linear-gradient(180deg,#050505_0%,#090706_100%)] px-4 pb-10 pt-8 sm:px-6 sm:pb-12 sm:pt-10">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e1062a]/25 bg-[#e1062a]/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-red-100/80 sm:text-[10px]">
              <img src="/toh_logo.png" alt="" aria-hidden="true" className="h-4 w-4 rounded-full object-contain sm:h-5 sm:w-5" />
              Start your outing
            </div>
            <h1 className="mx-auto mt-5 max-w-5xl text-[2.45rem] font-black leading-[1.05] tracking-[-0.045em] sm:mt-6 sm:text-5xl lg:text-6xl">
              What are you <span className="text-[#e1062a]">planning?</span>
            </h1>
          </div>

          <GuidedJourneySteps activeStep={activeStep} className="mx-auto mt-7 max-w-4xl" />

          <div className="mx-auto mt-9 max-w-4xl rounded-[1.5rem] border border-white/10 bg-white/[0.025] p-4 sm:p-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a] sm:text-[11px]">Choose your plan type</p>
              <p className="mt-1 text-xs font-semibold text-white/40 sm:text-sm">Start with a complete outing, just a restaurant, or just an activity.</p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
              {planTypes.map((item) => {
                const selected = planType === item.id;
                return (
                  <button key={item.id} type="button" onClick={() => setPlanType(item.id)} className={`min-w-0 rounded-2xl border p-3 text-left transition sm:p-4 ${selected ? "border-[#e1062a]/70 bg-[#e1062a]/10" : "border-white/10 bg-black/30 hover:border-white/20"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-white sm:text-base">{item.label}</p>
                        <p className="mt-1 hidden text-xs font-semibold leading-5 text-white/40 sm:block">{item.description}</p>
                      </div>
                      <span className="shrink-0 text-lg sm:text-xl" aria-hidden="true">{item.icon}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/65 sm:text-xs">Search naturally</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-white/40 sm:text-sm">Describe it in a real sentence — for example, “Italian dinner with live music in Brooklyn.”</p>
              <div className="mt-3 rounded-[1.55rem] border border-white/10 bg-white/[0.045] p-1.5 shadow-2xl shadow-black/40 transition focus-within:border-[#e1062a]/55">
                <div className="relative flex min-h-16 items-center gap-2 rounded-[1.2rem] bg-black/55 p-1.5 sm:min-h-[4.5rem] sm:p-2">
                  {!idea ? (
                    <div className="pointer-events-none absolute left-4 right-16 top-1/2 -translate-y-1/2 truncate text-xs font-semibold text-white/40 sm:left-5 sm:right-44 sm:text-base">{typedPlaceholder}<span className="text-[#e1062a]">|</span></div>
                  ) : null}
                  <input value={idea} onChange={(event) => setIdea(event.target.value)} onKeyDown={(event) => event.key === "Enter" && continueToMakeItYours()} aria-label="Describe what you are planning in a sentence" className="h-12 min-w-0 flex-1 bg-transparent pl-3 pr-1 text-sm font-semibold text-white outline-none sm:h-14 sm:pl-4 sm:text-base" />
                  <button type="button" onClick={continueToMakeItYours} className="relative z-10 flex h-12 shrink-0 items-center justify-center rounded-[0.95rem] bg-[#e1062a] px-4 text-[10px] font-black uppercase tracking-[0.06em] text-white transition hover:bg-[#ff1744] sm:h-14 sm:min-w-[145px] sm:px-6 sm:text-[11px]"><span className="hidden sm:inline">Continue&nbsp;</span>→</button>
                </div>
              </div>
            </div>
          </div>
          {error && activeStep === 1 ? <p className="mx-auto mt-5 max-w-4xl rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">{error}</p> : null}
        </div>
      </section>

      {activeStep === 2 ? (
        <section ref={makeItYoursRef} id="make-it-yours" className="scroll-mt-4 px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-5xl">
            <GuidedJourneySteps activeStep={2} className="mx-auto max-w-4xl" />
            <div className="mt-9">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Step 2 of 4</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-5xl">Make it yours.</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/50 sm:text-base">Set the area, timing, and preferences that matter. If your sentence already included an area, we keep it here automatically.</p>
            </div>

            {summary.length ? (
              <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
                <span className="mr-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Your plan</span>
                {summary.map((item) => <span key={item} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-white/70">{item}</span>)}
              </div>
            ) : null}

            <div className="mt-7 grid gap-5 lg:grid-cols-2">
              <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-white/55">Where?</p>
                {locationSource === "search" && location.trim() ? (
                  <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3.5">
                    <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/65">✓ From your search</p><p className="mt-1 truncate text-base font-black text-white">{location}</p></div>
                    <button type="button" onClick={() => setLocationSource("manual")} className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/65">Change</button>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2">
                    <input value={location} onChange={(event) => { setLocation(event.target.value); setLocationSource("manual"); if (event.target.value) setLocationSaved(false); }} placeholder="Neighborhood, city, or ZIP" className="h-14 rounded-2xl border border-white/10 bg-white/[0.045] px-4 font-semibold outline-none focus:border-[#e1062a]/55" />
                    <button type="button" onClick={requestUserLocation} className={`h-12 rounded-2xl border px-5 text-xs font-black uppercase tracking-[0.1em] ${locationSaved ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/[0.045] text-white/65"}`}>{locationSaved ? "✓ Using my location" : "Use my location"}</button>
                  </div>
                )}
              </div>

              <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-white/55">When?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {whenChoices.map((item) => <button key={item} type="button" onClick={() => selectWhen(item)} className={`rounded-full border px-4 py-2.5 text-sm font-black ${when === item ? "border-[#e1062a]/65 bg-[#e1062a]/15 text-white" : "border-white/10 bg-white/[0.035] text-white/60"}`}>{item}</button>)}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="rounded-2xl border border-white/10 bg-white/[0.035] p-3.5"><span className="text-xs font-black uppercase tracking-[0.14em] text-white/60">📅 Calendar</span><input type="date" value={customDate} onChange={(event) => { setCustomDate(event.target.value); if (event.target.value) setWhen("No specific time"); }} className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-black/45 px-3 text-base font-bold text-white outline-none [color-scheme:dark]" /></label>
                  <label className="rounded-2xl border border-white/10 bg-white/[0.035] p-3.5"><span className="text-xs font-black uppercase tracking-[0.14em] text-white/60">🕒 Time</span><input type="time" value={customTime} onChange={(event) => setCustomTime(event.target.value)} className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-black/45 px-3 text-base font-bold text-white outline-none [color-scheme:dark]" /></label>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[1.35rem] border border-white/10 bg-white/[0.025] p-4 sm:p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/55">What matters?</p>
              <p className="mt-1 text-xs font-semibold text-white/40">Optional — choose only the things you care about.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {preferenceChoices.map((item) => <button key={item} type="button" onClick={() => togglePreference(item)} className={`rounded-full border px-4 py-2.5 text-sm font-black ${preferences.includes(item) ? "border-[#e1062a]/65 bg-[#e1062a]/15 text-white" : "border-white/10 bg-white/[0.035] text-white/60"}`}>{preferences.includes(item) ? "✓ " : ""}{item}</button>)}
              </div>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Anything else we should know?" className="mt-5 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.045] p-4 font-semibold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]/55" />
            </div>

            {error ? <p className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">{error}</p> : null}

            <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button type="button" onClick={() => { setActiveStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-full border border-white/10 px-6 py-3.5 text-sm font-black text-white/65">← Back</button>
              <button type="button" onClick={showPicks} className="rounded-full bg-[#e1062a] px-7 py-3.5 text-sm font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-red-950/30 transition hover:bg-[#ff1744]">Show My Picks →</button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
