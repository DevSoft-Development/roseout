"use client";

import Link from "next/link";
import {
  Check,
  X,
  Sparkles,
  Crown,
  QrCode,
  CalendarCheck,
  BarChart3,
  Bot,
} from "lucide-react";

const freeFeatures = [
  "Basic TheOutHaven listing",
  "1 restaurant photo",
  "Appears in search results",
  "Limited AI discovery",
  "Basic view analytics",
  "Claim your business",
];

const proFeatures = [
  "Everything in Free",
  "TheOutHaven Reserve bookings",
  "Location layout builder",
  "Hostess/operator view",
  "SMS confirmations and reminders",
  "Waitlist texting",
  "Add-to-calendar links",
  "Basic guest notes",
  "Basic analytics",
  "Priority AI discovery",
  "Boosted search placement",
  "Advanced analytics dashboard",
  "Up to 10 photos",
  "Menu, website, phone & socials",
  "QR Growth Tools",
];

const comparison = [
  ["AI Discovery", "Limited", "Priority Boost"],
  ["Search Ranking", "Standard", "Boosted"],
  ["TheOutHaven Reserve", "No", "Yes"],
  ["Location Layout", "No", "Builder + live map"],
  ["SMS Reminders", "No", "Included"],
  ["Waitlist Texting", "No", "Included"],
  ["Calendar Add", "No", "ICS links"],
  ["Photos", "1 Photo", "Up to 10"],
  ["Analytics", "Views Only", "Views, Clicks & Bookings"],
  ["QR Tools", "No", "Yes"],
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#070707] text-white">
      {/* BACKGROUND */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-[-120px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-rose-700/25 blur-[120px]" />
      </div>

      <section className="relative max-w-7xl mx-auto px-6 py-20">
        {/* HERO */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
            <Sparkles className="h-4 w-4" />
            Built for restaurants
          </div>

          <h1 className="text-5xl font-black">
            Get Discovered.
            <span className="block text-rose-500">Get Booked.</span>
          </h1>

          <p className="mt-6 text-zinc-400">
            TheOutHaven connects restaurants with customers through AI-powered discovery and bookings.
          </p>

          <div className="mt-8 flex gap-4 justify-center">
            <Link
              href="/locations/apply?plan=free"
              className="px-6 py-3 bg-rose-600 rounded-full hover:bg-rose-500"
            >
              Get Started Free
            </Link>

            <form action="/api/checkout" method="POST">
              <input type="hidden" name="plan" value="pro" />
              <button className="px-6 py-3 border border-white/10 rounded-full hover:bg-white/10">
                Upgrade to Pro
              </button>
            </form>
          </div>
        </div>

        {/* PRICING */}
        <div className="grid md:grid-cols-2 gap-8 mt-16">
          {/* FREE */}
          <div className="border border-white/10 p-8 rounded-2xl">
            <h2 className="text-2xl font-bold">Free</h2>
            <p className="text-4xl mt-2">$0</p>

            <Link
              href="/locations/apply?plan=free"
              className="block mt-6 bg-white/10 text-center py-3 rounded-lg"
            >
              Start Free
            </Link>

            <ul className="mt-6 space-y-3">
              {freeFeatures.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-zinc-300">
                  <Check className="h-4 w-4 text-rose-400" />
                  {f}
                </li>
              ))}
              <li className="flex gap-2 text-zinc-500">
                <X className="h-4 w-4" /> Reservations
              </li>
            </ul>
          </div>

          {/* PRO */}
          <div className="border border-rose-500 p-8 rounded-2xl shadow-lg">
            <div className="text-rose-500 text-sm mb-2 flex items-center gap-2">
              <Crown className="h-4 w-4" />
              MOST POPULAR
            </div>

            <h2 className="text-2xl font-bold">TheOutHaven Pro</h2>
            <p className="text-4xl mt-2">$99</p>

            <form action="/api/checkout" method="POST">
              <input type="hidden" name="plan" value="pro" />
             <Link
  href="/checkout"
  className="block rounded-2xl bg-rose-600 px-5 py-4 text-center text-sm font-black text-white shadow-[0_0_35px_rgba(225,29,72,0.35)] transition hover:bg-rose-500"
>
  Upgrade to Pro
</Link>
            </form>

            <ul className="mt-6 space-y-3">
              {proFeatures.map((f) => (
                <li key={f} className="flex gap-2 text-sm">
                  <Check className="h-4 w-4 text-rose-300" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* FEATURES */}
        <div className="grid md:grid-cols-4 gap-6 mt-20">
          <Feature icon={Bot} title="AI Discovery" />
          <Feature icon={CalendarCheck} title="Bookings" />
          <Feature icon={BarChart3} title="Analytics" />
          <Feature icon={QrCode} title="QR Growth" />
        </div>

        {/* TABLE */}
        <div className="mt-20">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-400">
                <th>Feature</th>
                <th>Free</th>
                <th className="text-rose-400">Pro</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map(([f, free, pro]) => (
                <tr key={f} className="border-t border-white/10">
                  <td className="py-3">{f}</td>
                  <td>{free}</td>
                  <td className="text-rose-300">{pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Feature({ icon: Icon, title }: any) {
  return (
    <div className="border border-white/10 p-6 rounded-xl">
      <Icon className="h-6 w-6 text-rose-400 mb-3" />
      <h3 className="font-bold">{title}</h3>
    </div>
  );
}