import { supabaseAdmin } from "@/lib/supabase-admin";
import { DuplicateReviewClient } from "@/components/admin/location-tools/DuplicateReviewClient";

async function reviewCount(status: string, minScore?: number) {
  let query = supabaseAdmin
    .from("location_duplicate_review")
    .select("id", { count: "exact", head: true })
    .eq("status", status);

  if (minScore) query = query.gte("duplicate_score", minScore);
  const { count } = await query;
  return count || 0;
}

export default async function DuplicateReviewSection() {
  const [pending, high, merged, ignored, notDuplicate] = await Promise.all([
    reviewCount("pending"),
    reviewCount("pending", 95),
    reviewCount("merged"),
    reviewCount("ignored"),
    reviewCount("not_duplicate"),
  ]);

  return (
    <section id="duplicates" className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-white">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">Location Health</p>
        <h2 className="mt-1 text-2xl font-black">Possible Duplicates</h2>
        <p className="mt-2 max-w-3xl text-sm text-white/55">
          Review duplicate suggestions here instead of using a separate Trust & Safety page. Merge confirmed duplicates or mark false positives so search stays clean.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-bold uppercase text-white/40">Pending review</p><p className="mt-1 text-2xl font-black">{pending}</p></div>
        <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4"><p className="text-xs font-bold uppercase text-rose-100/60">High confidence</p><p className="mt-1 text-2xl font-black">{high}</p></div>
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4"><p className="text-xs font-bold uppercase text-emerald-100/60">Merged</p><p className="mt-1 text-2xl font-black">{merged}</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-bold uppercase text-white/40">Dismissed</p><p className="mt-1 text-2xl font-black">{ignored + notDuplicate}</p></div>
      </div>
      <DuplicateReviewClient />
    </section>
  );
}
