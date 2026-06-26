import Link from "next/link";

const sections = [
  ["Planning outings", "Learn how to search for dinner, activities, date nights, birthdays, family outings, and group plans."],
  ["Search tips", "Get better matches by adding location, vibe, budget, occasion, and timing."],
  ["Reservations and calls", "Learn how TheOutHaven helps you move from a match to a real plan."],
  ["Beta tester guide", "Learn how weekly beta tasks work and how feedback helps improve results."],
  ["Businesses", "Learn how businesses can claim listings, update details, and use TheOutHaven Reserve."],
  ["Account and support", "Get help with login, settings, feedback, and support requests."],
];

export default function KnowledgeBasePage() {
  return (
    <main className="min-h-screen bg-[#050505] px-4 pb-16 pt-[120px] text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-[#e1062a]/30 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,.28),transparent_34%),linear-gradient(135deg,#24050a,#090706_58%,#110b0b)] p-8 shadow-2xl shadow-red-950/30 md:p-12">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">TheOutHaven Support</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">Knowledge Base</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-white/65">Find quick guides for planning outings, using TheOutHaven, beta testing, and getting help.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/help" className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white transition hover:bg-red-500">Get Help</Link>
            <Link href="/faq" className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-black text-white/75 transition hover:bg-white hover:text-black">Read FAQ</Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sections.map(([title, description]) => (
            <article key={title} className="rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-6 transition hover:border-[#e1062a]/40 hover:bg-[#e1062a]/10">
              <h2 className="text-xl font-black">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-white/60">{description}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
