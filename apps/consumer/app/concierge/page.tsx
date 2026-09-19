import Link from "next/link";

export const metadata = {
  title: "AI Concierge | TheOutHaven",
  description: "Plan outings, optimize timing, suggest reservations, and reroute unavailable options with TheOutHaven AI Concierge.",
};

const steps = [
  "Tell the concierge your vibe, budget, area, timing, and group size.",
  "The planner balances dinner, activities, travel time, and reservation windows.",
  "If an option is unavailable, reroute to qualified alternatives without breaking the outing.",
];

const prompts = [
  "Plan a romantic Friday night in Brooklyn with dinner and a lounge after 9 PM.",
  "Find a birthday dinner with nearby activities and reservation options for six.",
  "Make a luxury date in Manhattan, but keep walking time under 12 minutes.",
];

export default function ConciergePage() {
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <section className="overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(245,183,0,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(225,6,42,0.2),transparent_32%),#080808] px-5 py-16 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_0.86fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.32em] text-[#f5b700]">AI Concierge</p>
            <h1 className="mt-4 text-5xl font-black leading-[0.92] tracking-[-0.06em] sm:text-7xl">Plan the whole outing, not just one reservation.</h1>
            <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-white/60">TheOutHaven Concierge extends the current search flow with timing, personalization, reservations, promotion-aware discovery, and fallback planning.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/create?mode=concierge" className="rounded-full bg-[#f5b700] px-6 py-4 text-sm font-black text-black hover:bg-amber-300">Start concierge plan</Link>
              <Link href="/reserve" className="rounded-full border border-white/10 px-6 py-4 text-sm font-black text-white hover:bg-white/10">Find reservations</Link>
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-white/40">Try a request</p>
            <div className="mt-4 space-y-3">
              {prompts.map((prompt) => (
                <Link key={prompt} href={`/create?input=${encodeURIComponent(prompt)}&mode=concierge`} className="block rounded-3xl bg-black/35 p-4 text-sm font-bold leading-6 text-white/70 hover:bg-white/10">{prompt}</Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step} className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">Step {index + 1}</p>
              <p className="mt-3 text-lg font-black leading-7">{step}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-6 sm:p-8">
          <h2 className="text-3xl font-black tracking-[-0.04em]">Concierge capabilities</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {["Outing planning", "Timing optimization", "Reservation suggestions", "Unavailable-option reroutes", "Personalized recommendations"].map((item) => (
              <div key={item} className="rounded-2xl bg-black/30 px-4 py-4 text-sm font-black text-white/70">{item}</div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
