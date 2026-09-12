"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const quickIdeas = [
  "Date night",
  "Girls night",
  "Dinner + activity",
  "Birthday",
  "Tonight",
  "Near me",
];

const typewriterPrompts = [
  "Dinner and something fun in Brooklyn tonight",
  "Sushi and karaoke near me",
  "Rooftop drinks and an activity in Manhattan",
  "Date night within walking distance",
  "Brunch and something to do afterward",
];

type ResolvedPlannerType = "outing" | "restaurant" | "activity";

export default function LiveOutingSearch() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  const [focused, setFocused] = useState(false);
  const [resolvingIntent, setResolvingIntent] = useState(false);
  const [intentError, setIntentError] = useState("");

  useEffect(() => {
    if (prompt || focused) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setTypedPlaceholder(typewriterPrompts[0]);
      return;
    }

    let promptIndex = 0;
    let characterIndex = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const current = typewriterPrompts[promptIndex];

      if (!deleting) {
        characterIndex += 1;
        setTypedPlaceholder(current.slice(0, characterIndex));

        if (characterIndex >= current.length) {
          deleting = true;
          timer = setTimeout(tick, 1650);
          return;
        }

        timer = setTimeout(tick, 48);
        return;
      }

      characterIndex -= 1;
      setTypedPlaceholder(current.slice(0, Math.max(characterIndex, 0)));

      if (characterIndex <= 0) {
        deleting = false;
        promptIndex = (promptIndex + 1) % typewriterPrompts.length;
        timer = setTimeout(tick, 320);
        return;
      }

      timer = setTimeout(tick, 24);
    };

    setTypedPlaceholder("");
    timer = setTimeout(tick, 420);

    return () => clearTimeout(timer);
  }, [focused, prompt]);

  async function startPlanner(input: string) {
    const cleanInput = input.trim();
    if (!cleanInput || resolvingIntent) return;

    setResolvingIntent(true);
    setIntentError("");

    try {
      const response = await fetch("/api/search/resolve-plan-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: cleanInput }),
      });
      const data = await response.json().catch(() => ({}));
      const planType = data?.planType as ResolvedPlannerType | undefined;

      if (!response.ok || !planType || !["outing", "restaurant", "activity"].includes(planType)) {
        throw new Error("intent_resolution_failed");
      }

      const params = new URLSearchParams({
        step: "2",
        planType,
        prompt: cleanInput,
        guidedFlow: "guided_create_v1",
        journey: "four_step",
        source: "homepage_outing_search",
      });

      router.push(`/create?${params.toString()}`);
    } catch {
      setIntentError("We couldn’t understand that search yet. Try again so we don’t build the wrong type of plan.");
      setResolvingIntent(false);
    }
  }

  function openPlanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void startPlanner(prompt);
  }

  function useQuickIdea(idea: string) {
    setPrompt(idea);
    setIntentError("");
  }

  return (
    <section id="plan-your-outing" className="w-full" aria-label="Plan your outing">
      <form
        onSubmit={openPlanner}
        className="mx-auto flex max-w-5xl flex-col gap-2 rounded-[1.75rem] border border-white/15 bg-white/[0.075] p-2 shadow-[0_32px_90px_rgba(0,0,0,.5)] backdrop-blur-xl sm:flex-row sm:items-center sm:rounded-full"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[1.35rem] bg-black/35 px-4 sm:rounded-full sm:bg-transparent sm:px-5">
          <span aria-hidden="true" className="text-lg text-[#ff8a9b]">✦</span>
          <input
            value={prompt}
            onChange={(event) => { setPrompt(event.target.value); setIntentError(""); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label="Describe the outing you want"
            placeholder={typedPlaceholder}
            className="h-16 min-w-0 flex-1 bg-transparent text-base font-bold text-white outline-none placeholder:font-semibold placeholder:text-white/35 sm:h-[4.5rem] sm:text-lg"
          />
        </div>
        <button
          type="submit"
          disabled={!prompt.trim() || resolvingIntent}
          className="h-14 shrink-0 rounded-full bg-[#e1062a] px-7 text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-[#ff1744] disabled:cursor-not-allowed disabled:opacity-40 sm:h-[4.5rem] sm:px-9"
        >
          {resolvingIntent ? "Understanding…" : "Find My Outing"}
        </button>
      </form>

      {intentError ? <p className="mt-3 text-center text-sm font-semibold text-red-200/80">{intentError}</p> : null}

      <p className="mt-4 text-center text-sm font-semibold text-white/45">
        Try describing the whole night — not just a restaurant.
      </p>

      <div className="mx-auto mt-5 flex max-w-4xl flex-wrap justify-center gap-2.5">
        {quickIdeas.map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => useQuickIdea(idea)}
            className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2.5 text-sm font-bold text-white/65 transition hover:border-[#e1062a]/55 hover:bg-[#e1062a]/10 hover:text-white"
          >
            {idea}
          </button>
        ))}
      </div>
    </section>
  );
}
