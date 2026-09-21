import type { Metadata } from "next";
import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Trust Center",
  description:
    "Learn how TheOutHaven recommendations, business information, sponsored placements, reviews, personalization, and support work.",
  path: "/trust",
});

const trustCards = [
  {
    title: "How recommendations work",
    body: "TheOutHaven matches what you ask for with available business information such as location, cuisine, activity type, price, hours, distance, and outing context. Suggestions are options for you to review, not decisions made for you.",
  },
  {
    title: "How we use AI",
    body: "TheOutHaven may use AI and other technology to understand natural-language requests and improve parts of the experience. Business facts and search criteria remain separate from generated wording, and you stay in control of what you choose.",
  },
  {
    title: "Business information",
    body: "Claimed means an authorized business representative controls the listing. Verified means TheOutHaven has completed the applicable verification process. Business details can still change, so important plans should be confirmed with the business.",
  },
  {
    title: "Sponsored placements",
    body: "When payment or a promotion affects placement, TheOutHaven identifies the placement as Sponsored. Sponsored placement is different from an organic recommendation.",
  },
  {
    title: "Reviews",
    body: "TheOutHaven does not create fake customer reviews or testimonials. Review moderation and visit-verification signals are used to reduce spam and misleading content while keeping the reviewer's opinion separate from verification.",
  },
  {
    title: "Personalization and privacy",
    body: "When personalization is available, it can use activity such as saves, clicks, reservations, and completed outings to improve suggestions. Personalization controls are designed to let you decide whether those signals are used.",
  },
  {
    title: "Human support",
    body: "Technology can help with routine questions, but important reservation, billing, account, business-verification, and support issues can be escalated to a person.",
  },
];

export default function TrustPage() {
  return (
    <main className="min-h-screen bg-black pb-28 text-white">
      <TheOutHavenHeader />
      <section className="relative overflow-hidden px-6 pb-14 pt-28">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(225,6,42,0.24),transparent_32%),linear-gradient(180deg,#050505,#000)]" />
        <div className="relative mx-auto max-w-5xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">Trust Center</p>
          <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">
            Real places. Clear reasons. Your choice.
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-white/60 md:text-lg">
            TheOutHaven uses technology to make planning easier while keeping recommendations understandable, paid placement visible, and important choices in your hands.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/create" className="rounded-2xl bg-[#e1062a] px-5 py-3 text-sm font-black text-white">
              Plan an outing
            </Link>
            <Link href="/privacy" className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-white/80">
              Privacy Policy
            </Link>
            <Link href="/support" className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-white/80">
              Get help
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 pb-10">
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
          {trustCards.map((card) => (
            <article key={card.title} className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-xl font-black">{card.title}</h2>
              <p className="mt-3 text-sm leading-7 text-white/60">{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="mx-auto max-w-5xl rounded-[1.75rem] border border-[#e1062a]/25 bg-[#e1062a]/10 p-6 md:p-8">
          <h2 className="text-2xl font-black">Our operating principles</h2>
          <div className="mt-5 grid gap-3 text-sm font-bold text-white/75 sm:grid-cols-2 lg:grid-cols-5">
            {["Real places", "Clear reasons", "Visible sponsorship", "User control", "Human help"].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4">{item}</div>
            ))}
          </div>
          <p className="mt-6 text-sm leading-7 text-white/55">
            See the <Link className="font-black text-white underline underline-offset-4" href="/faq">FAQ</Link> for practical questions about results and reservations, or <Link className="font-black text-white underline underline-offset-4" href="/contact">contact us</Link> if something does not look right.
          </p>
        </div>
      </section>
    </main>
  );
}
