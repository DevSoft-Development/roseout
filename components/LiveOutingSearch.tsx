"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const examples = [
  "Italian dinner and comedy show in Manhattan",
  "Date night in Brooklyn",
  "Seafood rooftop restaurant in Queens",
];

const typewriterPrompts = [
  "Italian dinner and comedy show in Manhattan",
  "Rooftop drinks and something fun in Brooklyn",
  "A romantic birthday dinner in Queens",
  "Brunch and an activity on Long Island",
];

export default function LiveOutingSearch() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  const [focused, setFocused] = useState(false);

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
          timer = setTimeout(tick, 1600);
          return;
        }

        timer = setTimeout(tick, 52);
        return;
      }

      characterIndex -= 1;
      setTypedPlaceholder(current.slice(0, Math.max(characterIndex, 0)));

      if (characterIndex <= 0) {
        deleting = false;
        promptIndex = (promptIndex + 1) % typewriterPrompts.length;
        timer = setTimeout(tick, 350);
        return;
      }

      timer = setTimeout(tick, 28);
    };

    setTypedPlaceholder("");
    timer = setTimeout(tick, 450);

    return () => clearTimeout(timer);
  }, [focused, prompt]);

  function openPlanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = prompt.trim();
    if (!input) return;

    const params = new URLSearchParams({
      guided: "results",
      planType: "outing",
      prompt: input,
      guidedFlow: "guided_create_v1",
      journey: "four_step",
      source: "homepage_outing_search",
    });

    router.push(`/create?${params.toString()}`);
  }

  return (
    <section id="plan-your-outing" className="w-full" aria-labelledby="plan-your-outing-title">
      <div className="mx-auto max-w-5xl">
        <div className="mb-7 text-center">
          <p className="text-xs font-black uppercase tracking-[0.26em] text-[#ff8a9b]">
            Start with what sounds good
          </p>
          <h2 id="plan-your-outing-title" className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl lg:text-5xl">
            Tell us the outing you have in mind.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/58">
            Dinner and a show. Rooftop drinks. A birthday night in Queens. Say it your way and TheOutHaven will help bring the plan together.
          </p>
        </div>

        <form onSubmit={openPlanner} className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-2 shadow-2xl shadow-black/50 sm:flex sm:items-center sm:gap-2 sm:rounded-full">
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label="Describe your outing"
            placeholder={typedPlaceholder}
            className="h-14 w-full rounded-full border border-white/10 bg-black/60 px-5 text-base font-semibold text-white outline-none transition placeholder:text-white/35 focus:border-[#e1062a]/60 sm:h-16 sm:border-0 sm:bg-transparent"
          />
          <button
            type="submit"
            disabled={!prompt.trim()}
            className="mt-2 h-14 w-full shrink-0 rounded-full bg-[#e1062a] px-7 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#ff1744] disabled:cursor-not-allowed disabled:opacity-40 sm:mt-0 sm:h-16 sm:w-auto"
          >
            Plan my outing
          </button>
        </form>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-xs font-bold text-white/60 transition hover:border-[#e1062a]/50 hover:text-white"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
