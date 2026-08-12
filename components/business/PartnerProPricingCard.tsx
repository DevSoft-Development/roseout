"use client";

import Link from "next/link";
import { useState } from "react";

type BillingInterval = "monthly" | "annual";

const proFeatures = [
  "Everything in Essentials",
  "Reserve features included",
  "Reservations and waitlists",
  "Guest management and notes",
  "SMS reminders",
  "Analytics and advanced business tools",
];

export default function PartnerProPricingCard({
  claimHref,
}: {
  claimHref: string;
}) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const annual = interval === "annual";

  return (
    <article className="relative flex h-full flex-col rounded-[2rem] border border-[#e1062a]/70 bg-[linear-gradient(180deg,rgba(225,6,42,0.2),rgba(255,255,255,0.045))] p-6 shadow-2xl shadow-red-500/15 sm:p-8">
      <span className="mb-5 w-fit rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black uppercase tracking-[0.18em]">
        Partner Pro includes reservations
      </span>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-3xl font-black tracking-tight">Partner Pro</h3>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/55">
            A standalone reservation portal, website embed, waitlist, guest
            management, reminders, analytics, and owner tools.
          </p>
        </div>

        <div
          className="grid shrink-0 grid-cols-2 rounded-full border border-white/15 bg-black/45 p-1"
          role="group"
          aria-label="Partner Pro billing interval"
        >
          {(["monthly", "annual"] as const).map((option) => {
            const selected = interval === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => setInterval(option)}
                className={`rounded-full px-4 py-2 text-xs font-black capitalize transition ${
                  selected
                    ? "bg-white text-black"
                    : "text-white/55 hover:text-white"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-end gap-x-2 gap-y-1">
        <p className="text-5xl font-black">{annual ? "$999" : "$99"}</p>
        <p className="pb-2 text-sm font-black text-white/45">
          {annual ? "/year" : "/month"}
        </p>
        {annual ? (
          <p className="w-full text-sm font-black text-emerald-300">
            Save $189 per year
          </p>
        ) : null}
      </div>

      <p className="mt-4 text-xs font-semibold leading-5 text-white/45">
        Taxes are calculated automatically at checkout.
      </p>

      <ul className="mt-7 grid flex-1 gap-3 sm:grid-cols-2">
        {proFeatures.map((feature) => (
          <li
            key={feature}
            className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm font-semibold leading-6 text-white/66"
          >
            ✓ {feature}
          </li>
        ))}
      </ul>

      <Link
        href={`${claimHref}?plan=${interval}`}
        className="mt-7 inline-flex w-full items-center justify-center rounded-2xl bg-[#e1062a] px-7 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition duration-200 hover:bg-red-500"
      >
        {annual ? "Start Annual" : "Start Monthly"}
      </Link>
    </article>
  );
}
