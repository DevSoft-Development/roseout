"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { trackClientEvent } from "@/lib/analytics/trackClientEvent";
import { detectRequestedGeo } from "@/lib/search/geo-matching";

type PlanType = "outing" | "restaurant" | "activity";
type WizardStep = 1 | 2 | 3;
type LocationSource = "search" | "manual" | "device" | null;

const LOCATION_KEY = "theouthaven_user_location";

const typingSearches = [
  "Steak dinner and rooftop drinks in Manhattan",
  "Italian dinner with live music",
  "Birthday dinner and bowling in Queens",
  "Girls night with cocktails in Brooklyn",
  "Brunch and an activity nearby",
  "Dinner and hookah same location",
  "Seafood dinner with jazz after",
  "Walking distance dinner and activity",
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

const whenChoices = ["Today", "Tonight", "Tomorrow", "This weekend", "No specific time"];

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
    // Planner analytics must never block the customer journey.
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
  const [step, setStep] = useState<WizardStep>(1);
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
    safelyTrack("planner_started", { step: 1, flow_version: "guided_create_v1" });

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
      const currentSearch = typingSearches[searchIndex];

      if (!deleting) {
        setTypedPlaceholder(currentSearch.slice(0, charIndex + 1));
        charIndex += 1;
        if (charIndex === currentSearch.length) {
          deleting = true;
          timeout = setTimeout(typeLoop, 1300);
          return;
        }
      } else {
        setTypedPlaceholder(currentSearch.slice(0, charIndex - 1));
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
    const typeLabel = planTypes.find((item) => item.id === planType)?.label || "Outing";
    return [
      typeLabel,
      idea.trim() || null,
      location.trim() || (locationSaved ? "Near me" : null),
      customDate || (when !== "No specific time" ? when : null),
      customTime || null,
      ...preferences.slice(0, 3),
    ].filter(Boolean) as string[];
  }, [customDate, customTime, idea, location, locationSaved, planType, preferences, when]);

  function requestUserLocation() {
    if (!navigator.geolocation) {
      setError("Location is not supported on this device. Enter a neighborhood, city, or ZIP instead.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const value = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        localStorage.setItem(LOCATION_KEY, JSON.stringify(value));
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
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
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
    } else if (value === "No specific time") {
      setCustomDate("");
      setCustomTime("");
    }
  }

  function continueFromStepOne() {
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
    safelyTrack("planner_intent_completed", {
      step: 1,
      plan_type: planType,
      idea: idea.trim(),
      location_from_search: detectedLocation || null,
      flow_version: "guided_create_v1",
    });
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function continueFromStepTwo() {
    if (!location.trim() && !locationSaved) {
      setError("Add an area or use your current location so we know where to plan.");
      return;
    }
    setError("");
    safelyTrack("planner_where_when_completed", {
      step: 2,
      plan_type: planType,
      location_mode:
        locationSource === "search"
          ? "search_query"
          : locationSaved || locationSource === "device"
            ? "current_location"
            : "typed",
      when,
      custom_date: customDate || null,
      custom_time: customTime || null,
      flow_version: "guided_create_v1",
    });
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildPrompt() {
    const typeInstruction =
      planType === "restaurant"
        ? "restaurant only"
        : planType === "activity"
          ? "activity only"
          : "restaurant and activity outing";
    const whereText = location.trim() || "near me";
    const timing = [customDate || (when !== "No specific time" ? when : null), customTime || null]
      .filter(Boolean)
      .join(" ");
    const preferenceText = preferences.length ? `Preferences: ${preferences.join(", ")}.` : "";
    const notesText = notes.trim() ? `Also: ${notes.trim()}.` : "";

    return [
      `Plan a ${typeInstruction}.`,
      idea.trim(),
      `Location: ${whereText}.`,
      timing ? `When: ${timing}.` : "",
      preferenceText,
      notesText,
      "Return the best options, ranked by fit.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function showPlans() {
    const prompt = buildPrompt();
    safelyTrack("planner_preferences_completed", {
      step: 3,
      plan_type: planType,
      preferences,
      has_notes: Boolean(notes.trim()),
      flow_version: "guided_create_v1",
    });
    safelyTrack("planner_generate_clicked", {
      plan_type: planType,
      preference_count: preferences.length,
      flow_version: "guided_create_v1",
    });

    const params = new URLSearchParams({
      guided: "results",
      planType,
      prompt,
      guidedFlow: "guided_create_v1",
    });
    router.push(`/create?${params.toString()}`);
  }

  return (
    <main className="min-h-screen bg-[#050505] pb-12 text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.2),transparent_32%),linear-gradient(180deg,#050505_0%,#090706_100%)] px-4 pb-7 pt-8 sm:px-6 sm:pb-8 sm:pt-10">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e1062a]/25 bg-[#e1062a]/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-red-100/80 sm:text-[10px] sm:tracking-[0.22em]">
              <img src="/toh_logo.png" alt="" aria-hidden="true" className="h-4 w-4 rounded-full object-contain sm:h-5 sm:w-5" />
              Step 1 of 3 · Start here
            </div>
            <h1 className="mx-auto mt-5 max-w-5xl text-[2.45rem] font-black leading-[1.05] tracking-[-0.045em] text-white sm:mt-6 sm:text-5xl sm:leading-[1.06] lg:text-6xl">
              What are you <span className="text-[#e1062a]">planning?</span>
            </h1>
          </div>

          <div className="mx-auto mt-6 max-w-4xl sm:mt-7">
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              {[
                [1, "Plan"],
                [2, "Where & When"],
                [3, "Preferences"],
              ].map(([number, label]) => {
                const numericStep = number as WizardStep;
                const active = step === numericStep;
                const complete = step > numericStep;
                return (
                  <button
                    key={number}
                    type="button"
                    disabled={!complete}
                    onClick={() => complete && setStep(numericStep)}
                    className="text-left disabled:cursor-default"
                  >
                    <div className={`h-1 rounded-full ${active || complete ? "bg-[#e1062a]" : "bg-white/10"}`} />
                    <p className={`mt-2 text-[9px] font-black uppercase tracking-[0.1em] sm:text-[11px] sm:tracking-[0.14em] ${active ? "text-white" : complete ? "text-white/65" : "text-white/30"}`}>
                      {number}. {label}
                    </p>
                  </button>
                );
              })}
            </div>

            {step > 1 && summary.length ? (
              <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
                <span className="mr-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Your plan</span>
                {summary.map((item) => (
                  <span key={item} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-white/70">{item}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-8">
        {step === 1 ? (
          <div className="animate-[fadeIn_.2s_ease-out]">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.025] p-4 sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a] sm:text-[11px] sm:tracking-[0.22em]">Choose your plan type</p>
                <p className="text-[11px] font-semibold text-white/45 sm:text-sm">Complete outing, restaurant, or activity.</p>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-4">
                {planTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setPlanType(type.id)}
                    className={`min-w-0 rounded-2xl border p-3.5 text-left transition sm:p-4 ${planType === type.id ? "border-[#e1062a]/65 bg-[#e1062a]/12 shadow-[0_0_24px_rgba(225,6,42,0.1)]" : "border-white/10 bg-white/[0.035] hover:border-white/20"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[12px] font-black leading-5 sm:text-[15px]">{type.label}</p>
                        <p className="mt-1.5 line-clamp-3 text-[10px] font-semibold leading-4 text-white/45 sm:text-xs sm:leading-[1.15rem]">{type.description}</p>
                      </div>
                      <span className="shrink-0 text-xl leading-none sm:text-2xl" aria-hidden="true">{type.icon}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-7 sm:mt-8">
              <div className="flex flex-wrap items-end justify-between gap-2 sm:gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/65 sm:text-xs">Search naturally</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-white/40 sm:text-sm">
                    Describe it in a real sentence — for example, “Italian dinner with live music in Brooklyn.”
                  </p>
                </div>
                <span className="hidden text-[10px] font-black uppercase tracking-[0.14em] text-white/25 sm:inline">No keywords needed</span>
              </div>

              <div className="mt-3 rounded-[1.55rem] border border-white/10 bg-white/[0.045] p-1.5 shadow-2xl shadow-black/40 transition focus-within:border-[#e1062a]/55 focus-within:shadow-[0_0_30px_rgba(225,6,42,0.1)] sm:rounded-[1.7rem]">
                <div className="relative flex min-h-16 items-center gap-2 rounded-[1.2rem] bg-black/55 p-1.5 sm:min-h-[4.5rem] sm:rounded-[1.35rem] sm:p-2">
                  {!idea ? (
                    <div className="pointer-events-none absolute left-4 right-16 top-1/2 -translate-y-1/2 truncate text-xs font-semibold text-white/40 sm:left-5 sm:right-44 sm:text-base">
                      {typedPlaceholder}<span className="text-[#e1062a]">|</span>
                    </div>
                  ) : null}
                  <input
                    value={idea}
                    onChange={(event) => setIdea(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && continueFromStepOne()}
                    aria-label="Describe what you are planning in a sentence"
                    className="h-12 min-w-0 flex-1 bg-transparent pl-3 pr-1 text-sm font-semibold text-white outline-none sm:h-14 sm:pl-4 sm:text-base"
                  />
                  <button
                    type="button"
                    onClick={continueFromStepOne}
                    aria-label="Continue to where and when"
                    className="relative z-10 flex h-12 shrink-0 items-center justify-center rounded-[0.95rem] bg-[#e1062a] px-4 text-[10px] font-black uppercase tracking-[0.06em] text-white shadow-lg shadow-red-950/35 transition hover:bg-[#ff1744] sm:h-14 sm:min-w-[145px] sm:px-6 sm:text-[11px] sm:tracking-[0.08em]"
                  >
                    <span className="hidden sm:inline">Continue&nbsp;</span>→
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Step 2 of 3</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Where and when?</h2>
            <p className="mt-2 text-sm font-semibold text-white/50">We’ll use this to keep the recommendations practical.</p>

            <div className="mt-7 grid gap-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-white/55">Where?</p>
                {locationSource === "search" && location.trim() ? (
                  <div className="mt-2 flex items-center justify-between gap-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/65">✓ From your search</p>
                      <p className="mt-1 truncate text-base font-black text-white">{location}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLocationSource("manual")}
                      className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/65 transition hover:border-white/25 hover:text-white"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      id="guided-location"
                      value={location}
                      onChange={(event) => {
                        setLocation(event.target.value);
                        setLocationSource("manual");
                        if (event.target.value) setLocationSaved(false);
                      }}
                      placeholder="Neighborhood, city, or ZIP"
                      className="h-14 rounded-2xl border border-white/10 bg-white/[0.045] px-4 font-semibold outline-none transition focus:border-[#e1062a]/55"
                    />
                    <button
                      type="button"
                      onClick={requestUserLocation}
                      className={`h-14 rounded-2xl border px-5 text-xs font-black uppercase tracking-[0.1em] ${locationSaved ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/[0.045] text-white/65"}`}
                    >
                      {locationSaved ? "✓ Using my location" : "Use my location"}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-white/55">When?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {whenChoices.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => selectWhen(item)}
                      className={`rounded-full border px-4 py-2.5 text-sm font-black transition ${when === item ? "border-[#e1062a]/65 bg-[#e1062a]/15 text-white" : "border-white/10 bg-white/[0.035] text-white/60"}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label htmlFor="guided-date" className="block rounded-2xl border border-white/10 bg-white/[0.035] p-3.5 transition focus-within:border-[#e1062a]/55">
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/60">
                      <span aria-hidden="true">📅</span> Calendar
                    </span>
                    <span className="mt-1 block text-[11px] font-semibold text-white/35">Choose the exact day.</span>
                    <input
                      id="guided-date"
                      type="date"
                      value={customDate}
                      onChange={(event) => {
                        setCustomDate(event.target.value);
                        if (event.target.value) setWhen("No specific time");
                      }}
                      className="mt-3 h-14 w-full rounded-xl border border-white/10 bg-black/45 px-3 text-base font-bold text-white outline-none [color-scheme:dark]"
                    />
                  </label>

                  <label htmlFor="guided-time" className="block rounded-2xl border border-white/10 bg-white/[0.035] p-3.5 transition focus-within:border-[#e1062a]/55">
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/60">
                      <span aria-hidden="true">🕒</span> Time
                    </span>
                    <span className="mt-1 block text-[11px] font-semibold text-white/35">Pick the time that works best.</span>
                    <input
                      id="guided-time"
                      type="time"
                      value={customTime}
                      onChange={(event) => setCustomTime(event.target.value)}
                      className="mt-3 h-14 w-full rounded-xl border border-white/10 bg-black/45 px-3 text-base font-bold text-white outline-none [color-scheme:dark]"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button type="button" onClick={() => setStep(1)} className="rounded-full border border-white/10 px-6 py-3.5 text-sm font-black text-white/65">← Back</button>
              <button type="button" onClick={continueFromStepTwo} className="rounded-full bg-[#e1062a] px-7 py-3.5 text-sm font-black uppercase tracking-[0.1em] text-white">Continue →</button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Step 3 of 3</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Make it yours.</h2>
            <p className="mt-2 text-sm font-semibold text-white/50">These are optional. Pick what matters and we’ll rank around it.</p>

            <div className="mt-6 flex flex-wrap gap-2">
              {preferenceChoices.map((item) => (
                <button key={item} type="button" onClick={() => togglePreference(item)} className={`rounded-full border px-4 py-2.5 text-sm font-black transition ${preferences.includes(item) ? "border-[#e1062a]/65 bg-[#e1062a]/15 text-white" : "border-white/10 bg-white/[0.035] text-white/60 hover:text-white"}`}>{preferences.includes(item) ? "✓ " : ""}{item}</button>
              ))}
            </div>

            <div className="mt-6">
              <label htmlFor="guided-notes" className="text-xs font-black uppercase tracking-[0.16em] text-white/55">Anything else?</label>
              <textarea id="guided-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder={planType === "restaurant" ? "Example: quiet, great cocktails, not too expensive" : planType === "activity" ? "Example: indoors, good for a group of six" : "Example: keep both places within walking distance"} className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.045] p-4 font-semibold text-white outline-none transition placeholder:text-white/25 focus:border-[#e1062a]/55" />
            </div>

            <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button type="button" onClick={() => setStep(2)} className="rounded-full border border-white/10 px-6 py-3.5 text-sm font-black text-white/65">← Back</button>
              <button type="button" onClick={showPlans} className="rounded-full bg-[#e1062a] px-7 py-3.5 text-sm font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-red-950/30 transition hover:bg-[#ff1744]">Show My Plans →</button>
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">{error}</p> : null}
      </section>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}
