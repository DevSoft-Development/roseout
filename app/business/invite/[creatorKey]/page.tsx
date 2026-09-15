import Link from "next/link";
import { notFound } from "next/navigation";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { findCreatorByKey } from "@/lib/creator-partners/program";

export default async function CreatorBusinessInvitePage({ params }: { params: Promise<{ creatorKey: string }> }) {
  const { creatorKey } = await params;
  const creator = await findCreatorByKey(creatorKey);
  if (!creator) notFound();
  const claimHref = `/business/claim/no-code?creator=${encodeURIComponent(creator.referral_code || creator.creator_key)}`;

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <TheOutHavenHeader />
      <section className="relative overflow-hidden px-5 pb-20 pt-32 sm:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.22),transparent_38%)]" />
        <div className="relative mx-auto max-w-5xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#ff526b]">Invited by {creator.display_name}</p>
            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">Put your business where people are planning to go.</h1>
            <p className="mt-5 text-base font-semibold leading-7 text-white/60 sm:text-lg">Claim your business for free. Keep your details accurate, show up in TheOutHaven discovery, and upgrade only when you want booking, website, guest-management, and growth tools.</p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <article className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-7">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Essentials</p>
              <h2 className="mt-3 text-3xl font-black">Free</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-white/55">Get discovered and manage your presence.</p>
              <ul className="mt-6 space-y-3 text-sm font-semibold text-white/70"><li>✓ Claim and manage your business</li><li>✓ Keep photos and contact details current</li><li>✓ Publish basic events and experiences</li><li>✓ Send guests to your existing booking or website</li></ul>
            </article>
            <article className="rounded-[2rem] border border-[#e1062a]/60 bg-[#e1062a]/10 p-7">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff8a9c]">Essentials+</p>
              <h2 className="mt-3 text-3xl font-black">$99/month</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-white/60">Turn discovery into bookings, customers, and measurable growth.</p>
              <ul className="mt-6 space-y-3 text-sm font-semibold text-white/75"><li>✓ Reservations and waitlist tools</li><li>✓ Build or connect your website</li><li>✓ Guest and marketing tools</li><li>✓ See which activity is actually driving business</li></ul>
            </article>
          </div>

          <div className="mt-10 text-center">
            <Link href={claimHref} className="inline-flex rounded-2xl bg-[#e1062a] px-8 py-4 text-sm font-black shadow-xl shadow-red-500/20">Find or add your business</Link>
            <p className="mt-3 text-xs font-semibold text-white/35">You can start free. No card is required for Essentials.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
