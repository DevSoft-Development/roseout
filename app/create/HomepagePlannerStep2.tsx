"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GuidedJourneySteps from "@/components/planner/GuidedJourneySteps";
import { detectRequestedGeo } from "@/lib/search/geo-matching";

const whenChoices = ["Today", "Tonight", "Tomorrow", "This weekend", "No specific time"];
const preferenceChoices = ["Romantic", "Upscale", "Lively", "Walking distance", "Budget friendly"];

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function locationFromPrompt(prompt: string) {
  const geo = detectRequestedGeo(prompt);
  if (!geo) return "";
  const value = geo.neighborhood || geo.area || geo.borough || geo.city || geo.county || geo.areaGroup || geo.region || geo.terms?.[0] || "";
  return value ? titleCase(value) : "";
}

export default function HomepagePlannerStep2() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prompt = (searchParams.get("prompt") || "").trim();
  const detectedLocation = useMemo(() => locationFromPrompt(prompt), [prompt]);
  const [location, setLocation] = useState(detectedLocation);
  const [when, setWhen] = useState("No specific time");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [error, setError] = useState("");

  function togglePreference(value: string) {
    setPreferences((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function showPicks() {
    if (!prompt) {
      router.push("/#plan-your-outing");
      return;
    }
    if (!location.trim()) {
      setError("Add an area so we know where to plan your outing.");
      return;
    }

    const fullPrompt = [
      "Plan a restaurant and activity outing.",
      prompt,
      `Location: ${location.trim()}.`,
      when !== "No specific time" ? `When: ${when}.` : "",
      preferences.length ? `Preferences: ${preferences.join(", ")}.` : "",
      "Return the best options, ranked by fit.",
    ].filter(Boolean).join(" ");

    const params = new URLSearchParams({
      guided: "results",
      planType: "outing",
      prompt: fullPrompt,
      guidedFlow: "guided_create_v1",
      journey: "four_step",
      source: "homepage_outing_search",
    });
    router.push(`/create?${params.toString()}`);
  }

  return (
    <main className="min-h-screen bg-[#050505] px-4 pb-16 pt-8 text-white sm:px-6 sm:pt-12">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#ff7188]">Your outing</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">Make it yours.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/55">Add the details that matter, then we’ll find the places that fit your plan.</p>
        </div>

        <GuidedJourneySteps activeStep={2} className="mt-7" />

        <section className="mt-7 rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 sm:p-8">
          <div className="rounded-2xl border border-[#e1062a]/25 bg-[#e1062a]/10 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ff8297]">What you have in mind</p>
            <p className="mt-2 text-base font-bold leading-7 text-white/85">{prompt}</p>
            <button type="button" onClick={() => router.push(`/?edit=${encodeURIComponent(prompt)}#plan-your-outing`)} className="mt-3 text-sm font-black text-white/60 transition hover:text-white">Change idea</button>
          </div>

          <div className="mt-7 grid gap-6 lg:grid-cols-2">
            <div>
              <label htmlFor="homepage-planner-area" className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Where</label>
              <input id="homepage-planner-area" value={location} onChange={(event) => { setLocation(event.target.value); setError(""); }} placeholder="Neighborhood, borough, city, or town" className="mt-3 h-14 w-full rounded-2xl border border-white/10 bg-black/45 px-5 text-base font-bold text-white outline-none placeholder:text-white/30 focus:border-[#e1062a]/70" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">When</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {whenChoices.map((choice) => (
                  <button key={choice} type="button" onClick={() => setWhen(choice)} className={`rounded-full border px-4 py-2.5 text-sm font-black transition ${when === choice ? "border-[#e1062a] bg-[#e1062a]/15 text-white" : "border-white/10 bg-black/35 text-white/55 hover:border-white/25 hover:text-white"}`}>{choice}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-7">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">What matters</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {preferenceChoices.map((choice) => {
                const active = preferences.includes(choice);
                return <button key={choice} type="button" onClick={() => togglePreference(choice)} aria-pressed={active} className={`rounded-full border px-4 py-2.5 text-sm font-black transition ${active ? "border-[#e1062a] bg-[#e1062a]/15 text-white" : "border-white/10 bg-black/35 text-white/55 hover:border-white/25 hover:text-white"}`}>{choice}</button>;
              })}
            </div>
          </div>

          {error ? <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">{error}</p> : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => router.push("/#plan-your-outing")} className="rounded-full border border-white/12 px-6 py-3 text-sm font-black text-white/60 transition hover:bg-white hover:text-black">Back to home</button>
            <button type="button" onClick={showPicks} className="rounded-full bg-[#e1062a] px-8 py-4 text-sm font-black text-white transition hover:bg-[#ff1744]">Show my picks →</button>
          </div>
        </section>
      </div>
    </main>
  );
}
