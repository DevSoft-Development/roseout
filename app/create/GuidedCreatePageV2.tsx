"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trackClientEvent } from "@/lib/analytics/trackClientEvent";
import { detectRequestedGeo } from "@/lib/search/geo-matching";
import GuidedJourneySteps from "@/components/planner/GuidedJourneySteps";

type PlanType = "outing" | "restaurant" | "activity";
type LocationSource = "search" | "manual" | "device" | null;

const LOCATION_KEY = "theouthaven_user_location";
const FLOW_VERSION = "guided_create_v1";
const JOURNEY_VERSION = "four_step";
const MAX_CUSTOM_MATTERS = 5;

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

const planTypes: Array<{ id: PlanType; label: string; mobileLabel: string; description: string; icon: string }> = [
  { id: "outing", label: "Restaurant + Activity", mobileLabel: "Outing", description: "A complete outing with food, drinks, and something to do.", icon: "✨" },
  { id: "restaurant", label: "Restaurant", mobileLabel: "Restaurant", description: "The right place to eat, brunch, or grab drinks.", icon: "🍽️" },
  { id: "activity", label: "Activity", mobileLabel: "Activity", description: "Something fun to do on its own.", icon: "🎳" },
];

const whenChoices = ["Today", "Tonight", "Tomorrow", "This weekend", "No specific time"];

const preferenceChoices = [
  { label: "Romantic", icon: "♥" },
  { label: "Upscale", icon: "✦" },
  { label: "Lively", icon: "♫" },
  { label: "Walking distance", icon: "↗" },
  { label: "Budget friendly", icon: "$" },
];

function safelyTrack(eventName: string, metadata: Record<string, unknown>) {
  try {
    trackClientEvent({ event_name: eventName, source: "guided_create", metadata });
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
  const value = geo.neighborhood || geo.area || geo.borough || geo.city || geo.county || geo.areaGroup || geo.region || geo.terms?.[0] || "";
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
  return getLocalDateValue(Math.round((date.getTime() - new Date().setHours(12, 0, 0, 0)) / 86400000));
}

export default function GuidedCreatePageV2() {
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
  const [customMatters, setCustomMatters] = useState<string[]>([]);
  const [matterInput, setMatterInput] = useState("");
  const [typedPlaceholder, setTypedPlaceholder] = useState(typingSearches[0]);
  const [locationSaved, setLocationSaved] = useState(false);
  const [error, setError] = useState("");
  const selectedPlanType = planTypes.find((item) => item.id === planType) || planTypes[0];

  useEffect(() => {
    document.title = "Create Your Outing | TheOutHaven";
    safelyTrack("planner_started", { step: 1, flow_version: FLOW_VERSION, journey_version: JOURNEY_VERSION });
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
    function loop() {
      const current = typingSearches[searchIndex];
      if (!deleting) {
        setTypedPlaceholder(current.slice(0, charIndex + 1));
        charIndex += 1;
        if (charIndex === current.length) {
          deleting = true;
          timeout = setTimeout(loop, 1300);
          return;
        }
      } else {
        setTypedPlaceholder(current.slice(0, charIndex - 1));
        charIndex -= 1;
        if (charIndex === 0) {
          deleting = false;
          searchIndex = (searchIndex + 1) % typingSearches.length;
          timeout = setTimeout(loop, 260);
          return;
        }
      }
      timeout = setTimeout(loop, deleting ? 32 : 55);
    }
    loop();
    return () => clearTimeout(timeout);
  }, []);

  function requestUserLocation() {
    if (!navigator.geolocation) {
      setError("Location is not supported on this device. Enter a neighborhood, city, or ZIP instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        localStorage.setItem(LOCATION_KEY, JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude }));
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
    setPreferences((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function addCustomMatter() {
    const value = matterInput.trim().replace(/[,;]+$/, "");
    if (!value || customMatters.length >= MAX_CUSTOM_MATTERS) {
      setMatterInput("");
      return;
    }
    if (customMatters.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setMatterInput("");
      return;
    }
    setCustomMatters((current) => [...current, value]);
    setMatterInput("");
    safelyTrack("planner_custom_matter_added", {
      step: 2,
      value,
      custom_matter_count: customMatters.length + 1,
      flow_version: FLOW_VERSION,
      journey_version: JOURNEY_VERSION,
    });
  }

  function selectWhen(value: string) {
    setWhen(value);
    if (value === "Today" || value === "Tonight") setCustomDate(getLocalDateValue(0));
    else if (value === "Tomorrow") setCustomDate(getLocalDateValue(1));
    else if (value === "This weekend") setCustomDate(getThisWeekendDateValue());
    else {
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
    safelyTrack("planner_intent_completed", { step: 1, plan_type: planType, idea: idea.trim(), location_from_search: detectedLocation || null, flow_version: FLOW_VERSION, journey_version: JOURNEY_VERSION });
    safelyTrack("planner_make_it_yours_viewed", { step: 2, plan_type: planType, flow_version: FLOW_VERSION, journey_version: JOURNEY_VERSION });
    window.setTimeout(() => makeItYoursRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
  }

  function buildPrompt() {
    const typeInstruction = planType === "restaurant" ? "restaurant only" : planType === "activity" ? "activity only" : "restaurant and activity outing";
    const timing = [customDate || (when !== "No specific time" ? when : null), customTime || null].filter(Boolean).join(" ");
    const allMatters = [...preferences, ...customMatters];
    return [
      `Plan a ${typeInstruction}.`,
      idea.trim(),
      `Location: ${location.trim() || "near me"}.`,
      timing ? `When: ${timing}.` : "",
      allMatters.length ? `Preferences: ${allMatters.join(", ")}.` : "",
      "Return the best options, ranked by fit.",
    ].filter(Boolean).join(" ");
  }

  function showPicks() {
    if (!location.trim() && !locationSaved) {
      setError("Add an area or use your current location so we know where to plan.");
      return;
    }
    const locationMode = locationSource === "search" ? "search_query" : locationSaved || locationSource === "device" ? "current_location" : "typed";
    const allMatters = [...preferences, ...customMatters];
    safelyTrack("planner_where_when_completed", { step: 2, plan_type: planType, location_mode: locationMode, when, custom_date: customDate || null, custom_time: customTime || null, flow_version: FLOW_VERSION, journey_version: JOURNEY_VERSION });
    safelyTrack("planner_preferences_completed", { step: 2, plan_type: planType, preferences, custom_matters: customMatters, preference_count: allMatters.length, has_notes: customMatters.length > 0, flow_version: FLOW_VERSION, journey_version: JOURNEY_VERSION });
    safelyTrack("planner_make_it_yours_completed", { step: 2, plan_type: planType, location_mode: locationMode, preference_count: allMatters.length, custom_matter_count: customMatters.length, has_exact_date: Boolean(customDate), has_exact_time: Boolean(customTime), flow_version: FLOW_VERSION, journey_version: JOURNEY_VERSION });
    safelyTrack("planner_generate_clicked", { plan_type: planType, preference_count: allMatters.length, next_step: 3, flow_version: FLOW_VERSION, journey_version: JOURNEY_VERSION });
    const params = new URLSearchParams({ guided: "results", planType, prompt: buildPrompt(), guidedFlow: FLOW_VERSION, journey: JOURNEY_VERSION });
    router.push(`/create?${params.toString()}`);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050505] pb-12 text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.18),transparent_34%),linear-gradient(180deg,#050505_0%,#090706_100%)] px-3.5 pb-7 pt-5 sm:px-6 sm:pb-10 sm:pt-9">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <div className="hidden items-center gap-2 rounded-full border border-[#e1062a]/25 bg-[#e1062a]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-red-100/80 sm:inline-flex">
              <img src="/toh_logo.png" alt="" aria-hidden="true" className="h-5 w-5 rounded-full object-contain" />
              Start your outing
            </div>
            <h1 className="mx-auto max-w-5xl text-[2.15rem] font-black leading-[1.02] tracking-[-0.045em] sm:mt-5 sm:text-5xl sm:leading-[1.05] lg:text-6xl">
              What are you <span className="block text-[#e1062a] sm:inline">planning?</span>
            </h1>
          </div>

          <GuidedJourneySteps activeStep={activeStep} className="mx-auto mt-5 max-w-5xl sm:mt-6" />

          <div className="mx-auto mt-5 max-w-4xl rounded-[1.35rem] border border-white/10 bg-white/[0.022] px-3.5 py-4 sm:mt-7 sm:rounded-[1.5rem] sm:p-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff3152] sm:text-[11px]">Choose your plan type</p>
              <p className="mt-1 text-sm font-semibold leading-5 text-white/60 sm:text-sm sm:text-white/40">Start with a complete outing, just a restaurant, or just an activity.</p>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
              {planTypes.map((item) => {
                const selected = planType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPlanType(item.id)}
                    aria-pressed={selected}
                    className={`min-w-0 rounded-2xl border px-2 py-3 text-center transition sm:p-4 sm:text-left ${selected ? "border-[#e1062a]/80 bg-[#e1062a]/12 shadow-[inset_0_0_0_1px_rgba(225,6,42,0.08)]" : "border-white/10 bg-black/30 hover:border-white/20"}`}
                  >
                    <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                      <div className="min-w-0 sm:order-1">
                        <p className="whitespace-nowrap text-[11px] font-black leading-4 sm:hidden">{item.mobileLabel}</p>
                        <p className="hidden text-base font-black sm:block">{item.label}</p>
                        <p className="mt-1 hidden text-xs font-semibold leading-5 text-white/40 sm:block">{item.description}</p>
                      </div>
                      <span className="order-first shrink-0 text-xl sm:order-2" aria-hidden="true">{item.icon}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-2.5 rounded-xl bg-white/[0.025] px-3 py-2.5 sm:hidden">
              <p className="text-sm font-semibold leading-5 text-white/62">{selectedPlanType.description}</p>
            </div>

            <div className="mt-5 sm:mt-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/72 sm:text-xs sm:text-white/65">Search naturally</p>
                  <p className="mt-1 text-sm font-semibold text-white/58 sm:text-sm sm:text-white/40">Describe it in a real sentence.</p>
                </div>
                <span className="hidden text-[9px] font-black uppercase tracking-[0.16em] text-white/25 sm:block">No keywords needed</span>
              </div>
              <div className="mt-3 rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-1.5 shadow-2xl shadow-black/40 transition focus-within:border-[#e1062a]/55 sm:rounded-[1.55rem]">
                <div className="relative flex min-h-[3.75rem] items-center gap-2 rounded-[1rem] bg-black/55 p-1.5 sm:min-h-[4.5rem] sm:rounded-[1.2rem] sm:p-2">
                  {!idea ? <div className="pointer-events-none absolute left-4 right-16 top-1/2 -translate-y-1/2 truncate text-sm font-semibold text-white/45 sm:left-5 sm:right-44 sm:text-base sm:text-white/40">{typedPlaceholder}<span className="text-[#e1062a]">|</span></div> : null}
                  <input value={idea} onChange={(event) => setIdea(event.target.value)} onKeyDown={(event) => event.key === "Enter" && continueToMakeItYours()} aria-label="Describe what you are planning in a sentence" className="h-12 min-w-0 flex-1 bg-transparent pl-3 pr-1 text-base font-semibold outline-none sm:h-14 sm:pl-4" />
                  <button type="button" onClick={continueToMakeItYours} aria-label="Continue to personalize your outing" className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.9rem] bg-[#e1062a] text-base font-black transition hover:bg-[#ff1744] sm:h-14 sm:w-auto sm:min-w-[145px] sm:px-6 sm:text-[11px] sm:uppercase sm:tracking-[0.06em]"><span className="hidden sm:inline">Continue&nbsp;</span>→</button>
                </div>
              </div>
            </div>
          </div>
          {error && activeStep === 1 ? <p className="mx-auto mt-3 max-w-4xl rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100 sm:mt-4">{error}</p> : null}
        </div>
      </section>

      {activeStep === 2 ? (
        <section ref={makeItYoursRef} id="make-it-yours" className="scroll-mt-16 px-3.5 py-4 sm:px-6 sm:py-5">
          <div className="mx-auto max-w-6xl">
            <GuidedJourneySteps activeStep={2} className="mx-auto max-w-5xl" />

            <div className="mt-5 flex items-end justify-between gap-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Step 2 of 4</p>
                <h2 className="mt-1 text-[1.7rem] font-black tracking-[-0.04em] sm:text-4xl">Make it yours.</h2>
                <p className="mt-1 max-w-2xl text-sm font-semibold leading-5 text-white/60 sm:text-sm sm:text-white/45">Set the area, timing, and the few things that matter most.</p>
              </div>
              <button type="button" onClick={() => { setActiveStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="hidden rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/55 sm:block">← Back</button>
            </div>

            <div className="mt-4 grid gap-3 sm:gap-4 lg:grid-cols-2">
              <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.025] p-3.5 sm:rounded-[1.3rem] sm:p-4">
                <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/65 sm:text-white/50">Where?</p>{locationSource === "search" && location.trim() ? <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[9px] font-black text-emerald-300">From your search</span> : null}</div>
                {locationSource === "search" && location.trim() ? (
                  <div className="mt-2.5 flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] px-3.5 sm:h-14 sm:px-4"><p className="min-w-0 truncate text-base font-black">{location}</p><button type="button" onClick={() => setLocationSource("manual")} className="min-h-10 shrink-0 rounded-full border border-white/10 px-3 text-[10px] font-black text-white/70">Change</button></div>
                ) : (
                  <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                    <input value={location} onChange={(event) => { setLocation(event.target.value); setLocationSource("manual"); if (event.target.value) setLocationSaved(false); }} placeholder="Neighborhood, city, or ZIP" className="h-12 min-w-0 rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-base font-semibold outline-none placeholder:text-white/30 focus:border-[#e1062a]/55 sm:h-14" />
                    <button type="button" onClick={requestUserLocation} className={`min-h-12 rounded-2xl border px-4 text-[10px] font-black uppercase tracking-[0.08em] sm:h-14 ${locationSaved ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/[0.045] text-white/70"}`}>{locationSaved ? "✓ My location" : "Use my location"}</button>
                  </div>
                )}
              </div>

              <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.025] p-3.5 sm:rounded-[1.3rem] sm:p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/65 sm:text-white/50">When?</p>
                <div className="mt-2.5 flex flex-wrap gap-2">{whenChoices.map((item) => <button key={item} type="button" onClick={() => selectWhen(item)} className={`min-h-11 rounded-full border px-3.5 py-2 text-xs font-black ${when === item ? "border-[#e1062a]/65 bg-[#e1062a]/15 text-white" : "border-white/10 bg-white/[0.035] text-white/65"}`}>{item}</button>)}</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"><span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/55 sm:text-white/45">Calendar</span><input type="date" value={customDate} onChange={(event) => { setCustomDate(event.target.value); if (event.target.value) setWhen("No specific time"); }} className="mt-1 h-9 w-full bg-transparent text-base font-bold outline-none [color-scheme:dark] sm:text-sm" /></label>
                  <label className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"><span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/55 sm:text-white/45">Time</span><input type="time" value={customTime} onChange={(event) => setCustomTime(event.target.value)} className="mt-1 h-9 w-full bg-transparent text-base font-bold outline-none [color-scheme:dark] sm:text-sm" /></label>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-[1.2rem] border border-white/10 bg-white/[0.025] p-3.5 sm:mt-4 sm:rounded-[1.3rem] sm:p-4">
              <div className="flex items-end justify-between gap-4">
                <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/65 sm:text-white/50">What matters?</p><p className="mt-0.5 text-sm font-semibold text-white/58 sm:text-xs sm:text-white/35">Pick a few, then add anything specific below.</p></div>
                <span className="hidden text-[9px] font-black uppercase tracking-[0.14em] text-white/25 sm:block">Optional</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {preferenceChoices.map((item) => {
                  const selected = preferences.includes(item.label);
                  return <button key={item.label} type="button" onClick={() => togglePreference(item.label)} className={`group min-h-[82px] rounded-2xl border px-3 py-3 text-left transition sm:min-h-0 ${selected ? "border-[#e1062a]/60 bg-[#e1062a]/12 shadow-[inset_0_0_0_1px_rgba(225,6,42,0.12)]" : "border-white/10 bg-black/25 hover:border-white/20"}`}><div className="flex items-center justify-between"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${selected ? "bg-[#e1062a] text-white" : "bg-white/[0.06] text-white/55"}`}>{item.icon}</span>{selected ? <span className="text-[10px] font-black text-[#ff7188]">✓</span> : null}</div><p className="mt-2 text-xs font-black leading-4">{item.label}</p></button>;
                })}
              </div>

              <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 focus-within:border-[#e1062a]/45">
                <div className="flex flex-wrap items-center gap-2">
                  {customMatters.map((item) => <button key={item} type="button" onClick={() => setCustomMatters((current) => current.filter((value) => value !== item))} title="Remove" className="min-h-10 rounded-xl border border-[#e1062a]/30 bg-[#e1062a]/10 px-3 py-2 text-xs font-black text-white">{item} <span className="ml-1 text-white/40">×</span></button>)}
                  <input disabled={customMatters.length >= MAX_CUSTOM_MATTERS} value={matterInput} onChange={(event) => setMatterInput(event.target.value.replace(/^\s+/, ""))} onKeyDown={(event) => { if ((event.key === " " || event.key === "Enter" || event.key === ",") && matterInput.trim()) { event.preventDefault(); addCustomMatter(); } }} onBlur={() => matterInput.trim() && addCustomMatter()} placeholder={customMatters.length >= MAX_CUSTOM_MATTERS ? "5 custom preferences added" : "Anything else we should know?"} className="h-11 min-w-0 flex-1 basis-full bg-transparent text-base font-semibold outline-none placeholder:text-white/30 disabled:cursor-not-allowed sm:basis-auto sm:text-sm" />
                </div>
              </div>
              <p className="mt-1.5 text-[10px] font-semibold text-white/38 sm:text-white/25">Add up to five custom preferences.</p>
            </div>

            {error ? <p className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-100">{error}</p> : null}

            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-[#080808]/90 p-2.5 sm:border-0 sm:bg-transparent sm:p-0">
              <button type="button" onClick={() => { setActiveStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="min-h-11 rounded-full border border-white/10 px-5 py-3 text-xs font-black text-white/70 sm:hidden">← Back</button>
              <div className="hidden sm:block" />
              <button type="button" onClick={showPicks} className="ml-auto min-h-11 rounded-full bg-[#e1062a] px-6 py-3 text-xs font-black uppercase tracking-[0.1em] shadow-lg shadow-red-950/30 transition hover:bg-[#ff1744] sm:px-7 sm:py-3.5">Show My Picks →</button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
