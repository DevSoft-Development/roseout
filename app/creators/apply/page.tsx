import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export const metadata = {
  title: "Apply | TheOutHaven Creator Partners",
  description: "Apply to become a TheOutHaven Creator Partner.",
};

const nicheOptions = ["Food", "Nightlife", "Date nights", "Things to do", "Brunch", "Events", "Long Island", "NYC neighborhoods", "Family outings", "Other"];

export default async function CreatorApplyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const submitted = params.submitted === "1";
  const existing = params.existing === "1";

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <TheOutHavenHeader />
      <section className="px-5 pb-20 pt-32 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <Link href="/creators" className="text-sm font-bold text-white/50 hover:text-white">← Creator Partners</Link>
          <p className="mt-8 text-xs font-black uppercase tracking-[0.25em] text-[#ff526b]">Creator Partner application</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Tell us about your audience.</h1>
          <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-white/55">No media kit required. We care most about whether your audience and local business relationships fit TheOutHaven.</p>

          {submitted ? <div className="mt-8 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5 text-sm font-bold text-emerald-100">{existing ? "We already have an application for this email. We’ll keep you posted there." : "Application received. We sent you a confirmation email and will let you know when your Creator Partner account is approved."}</div> : null}

          {!submitted ? <form action="/api/creators/apply" method="post" className="mt-10 space-y-6 rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 sm:p-8">
            <Field label="Your name or creator brand" name="display_name" placeholder="DrinkLinkNYC" required />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Email" name="email" type="email" placeholder="you@example.com" required />
              <Field label="Phone (optional)" name="phone" type="tel" placeholder="(555) 555-5555" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Instagram" name="instagram" placeholder="@yourhandle" />
              <Field label="TikTok" name="tiktok" placeholder="@yourhandle" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="YouTube or website (optional)" name="youtube" placeholder="https://..." />
              <Field label="Approximate followers" name="follower_count" type="number" min="0" placeholder="25000" />
            </div>
            <label className="block"><span className="text-sm font-black">Where is most of your audience?</span><select name="primary_market" className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none focus:border-[#e1062a]"><option>New York City</option><option>Long Island</option><option>NYC + Long Island</option><option>Other</option></select></label>
            <fieldset><legend className="text-sm font-black">What do you usually create content about?</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{nicheOptions.map((niche) => <label key={niche} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white/70"><input type="checkbox" name="niches" value={niche} className="h-4 w-4" />{niche}</label>)}</div></fieldset>
            <label className="block"><span className="text-sm font-black">Do you work directly with local businesses?</span><textarea name="business_relationships" rows={4} placeholder="For example: I create restaurant content, manage social media for 6 restaurants, or regularly work with venue owners." className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]" /></label>
            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm font-semibold leading-6 text-white/60"><input type="checkbox" name="agree" value="1" required className="mt-1 h-4 w-4" /><span>I understand the current Creator Partner offer is a one-time $99 commission for each eligible new business I refer that becomes a paying Essentials+ customer, subject to the program rules and validation period.</span></label>
            <button type="submit" className="w-full rounded-2xl bg-[#e1062a] px-7 py-4 text-sm font-black shadow-xl shadow-red-500/20">Submit application</button>
            <p className="text-center text-xs font-semibold leading-5 text-white/35">No follower minimum. No posting quota. No upfront creator fee.</p>
          </form> : null}
        </div>
      </section>
    </main>
  );
}

function Field({ label, name, type = "text", placeholder, required, min }: { label: string; name: string; type?: string; placeholder?: string; required?: boolean; min?: string }) {
  return <label className="block"><span className="text-sm font-black">{label}</span><input name={name} type={type} placeholder={placeholder} required={required} min={min} className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]" /></label>;
}
