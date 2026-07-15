import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function SearchAnchorVerificationPage() {
  const [searchable, linked, activeLinked, pending, failed, deadLetter, discoveries] = await Promise.all([
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq("is_searchable", true),
    supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).not("linked_location_id", "is", null),
    supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).not("linked_location_id", "is", null).eq("is_active", true).eq("is_searchable", true),
    supabaseAdmin.from("search_anchor_reconciliation_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabaseAdmin.from("search_anchor_reconciliation_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabaseAdmin.from("search_anchor_reconciliation_queue").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
    supabaseAdmin.from("search_anchor_discoveries").select("id", { count: "exact", head: true }).eq("status", "unresolved"),
  ]);

  const searchableCount = searchable.count ?? 0;
  const linkedCount = linked.count ?? 0;
  const activeLinkedCount = activeLinked.count ?? 0;
  const coverage = searchableCount ? Math.min(100, Math.round((activeLinkedCount / searchableCount) * 100)) : 0;
  const queueProblems = (failed.count ?? 0) + (deadLetter.count ?? 0);

  const cards = [
    ["Searchable locations", searchableCount],
    ["Linked anchors", linkedCount],
    ["Active linked anchors", activeLinkedCount],
    ["Coverage", `${coverage}%`],
    ["Pending queue", pending.count ?? 0],
    ["Queue problems", queueProblems],
    ["Unresolved discoveries", discoveries.count ?? 0],
  ];

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-400">Search anchors / Phases 6 and 7</p>
            <h1 className="mt-2 text-3xl font-bold">Verification & Intelligence</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">Verify rollout completion, monitor reconciliation health, and identify unresolved anchor opportunities from real searches.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/dashboard/search-anchors/operations" className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold">Run reconciliation</Link>
            <Link href="/admin/dashboard/search-anchors/audit" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold">Coverage audit</Link>
            <Link href="/admin/dashboard/search-anchors" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold">Back to anchors</Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(([label, value]) => (
            <article key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-red-100">{value}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-lg font-semibold">Phase 6 production verification</h2>
            <div className="mt-4 space-y-3 text-sm text-zinc-300">
              <p>{coverage >= 95 ? "Coverage is near completion." : "Coverage still needs reconciliation or eligibility review."}</p>
              <p>{pending.count ?? 0} items remain pending.</p>
              <p>{failed.count ?? 0} failed and {deadLetter.count ?? 0} dead-letter items require review.</p>
            </div>
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-lg font-semibold">Phase 7 search intelligence</h2>
            <div className="mt-4 space-y-3 text-sm text-zinc-300">
              <p>{discoveries.count ?? 0} unresolved anchor discoveries are available for review.</p>
              <p>Use curated imports for major venues, transit hubs, parks, campuses, airports, malls, and neighborhoods.</p>
              <p>Prioritize discoveries that repeat across searches or produce no-result outcomes.</p>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
