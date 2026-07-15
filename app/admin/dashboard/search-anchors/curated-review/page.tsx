import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import CuratedReviewClient from "./CuratedReviewClient";

export const dynamic = "force-dynamic";

export default async function CuratedAnchorReviewPage() {
  const { data, error } = await supabaseAdmin
    .from("search_anchors")
    .select("id, canonical_name, anchor_type, city, state, market, review_status, latitude, longitude")
    .eq("source_type", "curated")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw error;

  const anchors = data ?? [];
  const pending = anchors.filter((anchor) => anchor.review_status === "pending_review").length;
  const approved = anchors.filter((anchor) => anchor.review_status === "approved").length;
  const rejected = anchors.filter((anchor) => anchor.review_status === "rejected").length;

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-400">Search anchors / Curated review</p>
            <h1 className="mt-2 text-3xl font-bold">Approve Curated Places</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">Review CSV-imported anchors before making them active and searchable.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/dashboard/search-anchors/upload" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold">Upload another CSV</Link>
            <Link href="/admin/dashboard/search-anchors?view=curated" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold">Back to Curated Places</Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-amber-900 bg-amber-950/20 p-4"><p className="text-xs text-amber-300">Pending review</p><p className="mt-2 text-2xl font-semibold">{pending}</p></article>
          <article className="rounded-2xl border border-emerald-900 bg-emerald-950/20 p-4"><p className="text-xs text-emerald-300">Approved</p><p className="mt-2 text-2xl font-semibold">{approved}</p></article>
          <article className="rounded-2xl border border-red-900 bg-red-950/20 p-4"><p className="text-xs text-red-300">Rejected</p><p className="mt-2 text-2xl font-semibold">{rejected}</p></article>
        </section>

        <CuratedReviewClient anchors={anchors} />
      </div>
    </main>
  );
}
