import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { parseBusinessEntryIntent } from "@/lib/business/entry-intent";
import { getRestaurantPlanConfig } from "@/lib/business/product-entitlements";

type Params = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] || "" : v || "";
export default async function BusinessPlanReview({ searchParams }: { searchParams?: Params }) {
  const raw = searchParams ? await searchParams : {};
  const q = new URLSearchParams();
  for (const k of ["intent", "plan", "location_id", "source"]) {
    const value = first(raw[k]); if (value) q.set(k, value);
  }
  const entry = parseBusinessEntryIntent(q);
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/business/plan-review?" + q.toString())}`);
  if (!entry.plan) redirect("/business/dashboard");
  const plan = getRestaurantPlanConfig(entry.plan);
  return <main className="min-h-screen bg-[#050505] px-6 py-16 text-white">
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold">Review your selected plan</h1>
      <p className="mt-3 text-white/70">Your plan selection has been preserved. Confirm your restaurant and verified ownership before activating paid software.</p>
      <section className="mt-6 rounded-xl border border-white/20 p-6">
        <h2 className="text-xl font-semibold">{entry.plan === "essential-plus" ? "Essential+" : entry.plan === "select-plus" ? "Select+" : "Signature+"} — ${plan.monthlyUsd}/month per location</h2>
        <p className="mt-3 text-sm text-white/70">Includes {plan.smsSegments} SMS segments, {plan.marketingEmails.toLocaleString()} emails and {plan.aiReceptionistMinutes} AI minutes each month.</p>
        <p className="mt-3 text-sm text-amber-200">No charge has been made and no paid features are active. Checkout is not yet connected to this new plan selection.</p>
      </section>
      <div className="mt-6 flex flex-wrap gap-4">
        <Link href="/business/claim/no-code" className="rounded-xl border border-white/20 px-5 py-3">Verify or claim restaurant</Link>
        <Link href="/business/dashboard" className="rounded-xl border border-white/20 px-5 py-3">Business dashboard</Link>
      </div>
    </div>
  </main>;
}
