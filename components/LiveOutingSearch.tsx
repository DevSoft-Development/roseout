"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const examples = [
  "Italian dinner and comedy show in Manhattan",
  "Date night in Brooklyn",
  "Seafood rooftop restaurant in Queens",
];

export default function LiveOutingSearch() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

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
      source: "homepage_live_product",
    });

    router.push(`/create?${params.toString()}`);
  }

  return (
    <section id="live-product" className="w-full" aria-labelledby="live-product-title">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 text-center">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#ff8a9b]">
            Live product
          </p>
          <h2 id="live-product-title" className="mt-2 text-2xl font-black tracking-[-0.03em] sm:text-3xl">
            Describe an outing and use the real planner.
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-white/55">
            No account is required to search. The planner returns live TheOutHaven results and lets you continue into location profiles and outing planning.
          </p>
        </div>

        <form onSubmit={openPlanner} className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-2 shadow-2xl shadow-black/50 sm:flex sm:items-center sm:gap-2 sm:rounded-full">
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            aria-label="Describe your outing"
            placeholder="Italian dinner and comedy show in Manhattan"
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
