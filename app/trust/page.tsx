import Link from "next/link";
import type { Metadata } from "next";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Trust Center",
  description: "Learn how TheOutHaven recommendations, business verification, sponsored placements, reviews, personalization, privacy, and support work.",
  path: "/trust",
});

const sections = [
  ["How recommendations work", "TheOutHaven matches what you ask for with real restaurants, activities, events, and outing options using available business information, location, timing, distance, and other relevant criteria. You choose which option to view, change, save, or book."],
  ["How technology helps", "TheOutHaven uses technology, including AI in some parts of the service, to understand natural-language requests and improve the experience. AI is not a substitute for current business information, availability, or your own decision."],
  ["Business information", "Claimed means an authorized business representative controls the listing. Verified is shown only when TheOutHaven has completed the applicable verification process. Business details can still change, so important information should be confirmed before you go."],
  ["Sponsored results", "Paid placements are identified as Sponsored. Sponsored placement is kept distinct from ordinary matching so you can tell when payment influenced where something appears."],
  ["Reviews", "TheOutHaven does not create fake customer reviews or present generated testimonials as real customer feedback. When a review is tied to a qualifying completed visit or booking, TheOutHaven may label the visit as verified."],
  ["Personalization and privacy", "Personalization can use your TheOutHaven activity, such as saved places or completed outings, when enabled. Account controls are designed to let you manage whether those signals are used. See the Privacy Policy for additional details."],
  ["Human help", "Automated tools may help answer routine questions, but important reservation, billing, account, verification, or dispute issues can be escalated to TheOutHaven support."],
];

export default function TrustPage() {
  return (
    <main className="min-h-screen bg-[#050505] pb-24 text-white">
      <TheOutHavenHeader />
      <section className="relative overflow-hidden px-6 pb-14 pt-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(225,6,42,0.24),transparent_32%),linear-gradient(180deg,#050505,#000)]" />
        <div className="relative mx-auto max-w-5xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">Trust Center</p>
          <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">Real places. Clear reasons. Your choice.</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/65">TheOutHaven is built to help you spend less time searching and more time going out. Here is how we keep recommendations understandable, business information accountable, and important choices in your hands.</p>
        </div>
      </section>
      <section className="px-6">
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
          {sections.map(([title, body]) => (
            <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-xl font-black">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-white/60">{body}</p>
            </article>
          ))}
        </div>
        <div className="mx-auto mt-8 flex max-w-5xl flex-wrap gap-3">
          <Link href="/privacy" className="rounded-2xl bg-[#e1062a] px-5 py-3 text-sm font-black text-white">Privacy Policy</Link>
          <Link href="/faq" className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-white">FAQ</Link>
          <Link href="/support" className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-white">Get Help</Link>
        </div>
      </section>
    </main>
  );
}
