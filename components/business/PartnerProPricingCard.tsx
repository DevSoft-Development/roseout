"use client";

import Link from "next/link";
import { useState } from "react";

type BillingInterval = "monthly" | "annual";

const proFeatures = [
  {
    title: "Own your booking experience",
    description:
      "Accept reservations through a dedicated booking page and an embed for your existing website.",
  },
  {
    title: "Manage demand in one place",
    description:
      "Keep reservations and waitlists organized from the owner dashboard.",
  },
  {
    title: "Deliver more personal service",
    description:
      "Keep guest details and private notes available to your team.",
  },
  {
    title: "Reduce missed reservations",
    description:
      "Send automated SMS reminders that keep guests informed before their visit.",
  },
  {
    title: "See what drives business",
    description:
      "Track discovery, guest interest, and reservation activity with business analytics.",
  },
  {
    title: "Everything in Essentials",
    description:
      "Keep your claimed profile, contact details, photos, links, and discovery presence.",
  },
];

export default function PartnerProPricingCard({
  claimHref,
}: {
  claimHref: string;
}) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const annual = interval === "annual";

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-[2rem] border border-[#e1062a]/70 bg-[linear-gradient(145deg,rgba(225,6,42,0.24),rgba(255,255,255,0.045)_48%,rgba(225,6,42,0.08))] p-6 shadow-2xl shadow-red-500/15 sm:p-8">
      <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#e1062a]/15 blur-3xl" />

      <div className="relative">
        <span className="inline-flex w-fit rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black uppercase tracking-[0.18em]">
          Built to turn interest into bookings
        </span>

        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-3xl font-black tracking-tight">Partner Pro</h3>
            <p className="mt-3 max-w-xl text-base font-bold leading-7 text-white/75">
              Get booked. Stay organized. Build stronger guest relationships.
            </p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/50">
              A complete reservation and guest-management workspace for venues
              ready to turn TheOutHaven demand into measurable business.
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

        <div className="mt-6 flex flex-wrap gap-2">
          {["More bookings", "Fewer no-shows", "Clearer insights"].map(
            (outcome) => (
              <span
                key={outcome}
                className="rounded-full border border-white/12 bg-black/25 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white/70"
              >
                {outcome}
              </span>
            ),
          )}
        </div>

        <div className="mt-7 flex flex-wrap items-end gap-x-2 gap-y-1">
          <p className="text-5xl font-black">{annual ? "$999" : "$99"}</p>
          <p className="pb-2 text-sm font-black text-white/45">
            {annual ? "/year" : "/month"}
          </p>
          {annual ? (
            <p className="w-full text-sm font-black text-emerald-300">
              Save $189 per year — two months free
            </p>
          ) : null}
        </div>

        <p className="mt-4 text-xs font-semibold leading-5 text-white/45">
          Taxes are calculated automatically at checkout.
        </p>

        <ul className="mt-7 grid flex-1 gap-3 sm:grid-cols-2">
          {proFeatures.map((feature) => (
            <li
              key={feature.title}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e1062a] text-xs font-black text-white"
                >
                  ✓
                </span>
                <div>
                  <p className="text-sm font-black leading-5 text-white">
                    {feature.title}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-white/50">
                    {feature.description}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <Link
          href={`${claimHref}?plan=${interval}`}
          className="mt-7 inline-flex w-full items-center justify-center rounded-2xl bg-[#e1062a] px-7 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition duration-200 hover:bg-red-500"
        >
          Choose Partner Pro · {annual ? "Annual" : "Monthly"}
        </Link>
      </div>
    </article>
  );
}
