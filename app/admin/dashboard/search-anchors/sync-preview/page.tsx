import Link from "next/link";
import SyncPreviewClient from "./SyncPreviewClient";

export const dynamic = "force-dynamic";

export default function SearchAnchorSyncPreviewPage() {
  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-red-400">Search anchors / Controlled rollout</p>
            <h1 className="mt-2 text-3xl font-bold">Dry Run & Approval</h1>
            <p className="mt-2 max-w-3xl text-zinc-400">Preview every proposed linked-anchor change, approve the saved plan, then execute only a bounded production batch.</p>
          </div>
          <Link href="/admin/dashboard/search-anchors" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-200">Back to Search Anchors</Link>
        </header>

        <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 text-sm text-amber-100">
          Running a preview does not change anchors. Approval also does not change anchors. Production records change only after you click Execute Approved Batch and confirm.
        </div>

        <SyncPreviewClient />
      </div>
    </main>
  );
}
