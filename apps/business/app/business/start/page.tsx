import Link from "next/link";
import { parseBusinessEntryIntent, buildBusinessEntryQuery } from "@/lib/business/entry-intent";

type Params = Promise<Record<string, string | string[] | undefined>>;
function first(x: string | string[] | undefined) { return Array.isArray(x) ? x[0] ?? "" : x ?? ""; }
const plans = {
  "essential-plus": { title: "Essential+", price: 99 },
  "select-plus": { title: "Select+", price: 149 },
  "signature-plus": { title: "Signature+", price: 199 },
} as const;

/** Public, non-authorizing entry point. Claim verification and checkout are separate. */
export default async function BusinessStart({ searchParams }: { searchParams?: Params }) {
  const raw = searchParams ? await searchParams : {};
  const q = new URLSearchParams();
  for (const key of ["intent", "plan", "location_id", "source"]) {
    const value = first(raw[key]);
    if (value) q.set(key, value);
  }
  const entry = parseBusinessEntryIntent(q);
  const canonical = buildBusinessEntryQuery(entry);
  const selection = entry.plan ? plans[entry.plan] : null;
  const postAuth = `/business/onboarding?${canonical}`;
  const signIn = `/business/login?next=${encodeURIComponent(postAuth)}`;

  return (
    <main className="min-h-screen bg-[#050505] px-6 py-16 text-white">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-bold text-[#ec0b5b]">TheOutHaven Business</p>
        <h1 className="mt-4 text-3xl font-bold">Get started with your restaurant</h1>
        {selection && (
          <div className="mt-6 rounded-xl border border-white/20 p-5">
            <p className="text-white/70">Selected plan</p>
            <h2 className="text-xl font-bold">{selection.title} — ${selection.price}/month per location</h2>
            <p className="mt-2 text-sm text-white/60">Final prices and access are verified during billing. This page does not activate a subscription.</p>
          </div>
        )}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link className="rounded-xl border border-white/20 p-5 hover:border-white/60" href="/business/claim/no-code">
            <h2 className="font-bold">Claim my business</h2>
            <p className="mt-2 text-sm text-white/70">Use the existing secure ownership verification. Claiming a listing is free.</p>
          </Link>
          <Link className="rounded-xl border border-white/20 p-5 hover:border-white/60" href={signIn}>
            <h2 className="font-bold">Sign in to Business</h2>
            <p className="mt-2 text-sm text-white/70">Continue with your business account and manage its subscriptions.</p>
          </Link>
        </div>
        <p className="mt-6 text-sm text-white/60">Your selected plan does not prove business ownership or grant paid access.</p>
      </div>
    </main>
  );
}
