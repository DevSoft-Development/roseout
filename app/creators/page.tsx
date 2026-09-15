import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export const metadata = {
  title: "Creator Partners | TheOutHaven",
  description: "Partner with TheOutHaven, curate local outings, and earn $99 when a business you refer becomes an Essentials+ customer.",
};

const benefits = [
  ["Earn $99 per paid business", "When a new business you refer becomes an Essentials+ customer and completes the validation period, your $99 commission is paid automatically."],
  ["Keep creating your way", "There is no required posting quota. Share TheOutHaven when it naturally fits your food, nightlife, date-night, or things-to-do content."],
  ["Get your own creator presence", "Approved creators get a trackable referral link and can be featured through creator profiles, curated outings, and Discover."],
  ["We handle the sales process", "Introduce the business and keep your referral credit. TheOutHaven can handle the claim, follow-up, onboarding, and upgrade."],
] as const;

export default function CreatorsPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <TheOutHavenHeader />
      <section className="relative overflow-hidden px-5 pb-20 pt-32 sm:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.24),transparent_38%)]" />
        <div className="relative mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#ff526b]">TheOutHaven Creator Partners</p>
            <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-7xl">Create local influence that keeps paying you back.</h1>
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-white/65">Help people discover where to eat and what to do. Introduce great local businesses to TheOutHaven and earn <strong className="text-white">$99</strong> when each one becomes an Essentials+ customer.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/creators/apply" className="rounded-2xl bg-[#e1062a] px-7 py-4 text-sm font-black shadow-xl shadow-red-500/20">Apply to become a Creator Partner</Link>
              <Link href="/business/plans" className="rounded-2xl border border-white/15 px-7 py-4 text-sm font-black text-white/80">See what businesses get</Link>
            </div>
          </div>

          <div className="mt-16 grid gap-4 md:grid-cols-2">
            {benefits.map(([title, body]) => <article key={title} className="rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-6"><h2 className="text-xl font-black">{title}</h2><p className="mt-3 text-sm font-semibold leading-6 text-white/55">{body}</p></article>)}
          </div>

          <section className="mt-16 rounded-[2rem] border border-white/10 bg-black/55 p-7 sm:p-9">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ff526b]">How it works</p>
            <div className="mt-6 grid gap-6 md:grid-cols-4">
              {[
                ["1", "Join", "Apply and get approved."],
                ["2", "Share", "Use your creator link or refer a business from your dashboard."],
                ["3", "They upgrade", "The business joins Essentials+ at $99/month or $999/year."],
                ["4", "You get paid", "After the 14-day validation period, your $99 commission is released automatically."],
              ].map(([number, title, body]) => <div key={number}><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e1062a] text-sm font-black">{number}</span><h3 className="mt-4 text-lg font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-white/50">{body}</p></div>)}
            </div>
          </section>

          <section className="mx-auto mt-16 max-w-3xl text-center">
            <h2 className="text-3xl font-black sm:text-4xl">Built for local creators, not just giant influencer accounts.</h2>
            <p className="mt-4 text-base font-semibold leading-7 text-white/55">Food, nightlife, date-night, weekend, neighborhood, and experience creators can all apply. Strong local business relationships matter more than follower count alone.</p>
            <Link href="/creators/apply" className="mt-7 inline-flex rounded-2xl bg-white px-7 py-4 text-sm font-black text-black">Apply now</Link>
          </section>
        </div>
      </section>
    </main>
  );
}
