import Link from "next/link";
import SearchAnchorCsvUploader from "./SearchAnchorCsvUploader";

export const dynamic = "force-dynamic";

export default function SearchAnchorUploadPage() {
  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-400">Search anchors</p>
            <h1 className="mt-2 text-3xl font-bold">CSV Uploader</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">Validate and import curated anchor CSV files without using the terminal.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/dashboard/search-anchors/curated-review" className="rounded-xl bg-emerald-700 px-4 py-2 text-center text-sm font-semibold hover:bg-emerald-600">Approve curated list</Link>
            <a href="/templates/search-anchor-import-template.csv" download className="rounded-xl bg-red-700 px-4 py-2 text-center text-sm font-semibold hover:bg-red-600">Download template</a>
            <Link href="/admin/dashboard/search-anchors" className="rounded-xl border border-zinc-700 px-4 py-2 text-center text-sm font-semibold hover:border-red-700">Back to anchors</Link>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-sm text-zinc-300">
          <h2 className="font-semibold text-white">Required columns</h2>
          <p className="mt-2">canonical_name, anchor_type, latitude, longitude, default_radius_miles, max_radius_miles, and radius_strategy.</p>
          <p className="mt-2 text-zinc-500">Coordinate aliases such as lat/lng, lat/lon, and lat/long are normalized automatically. Files are limited to 2 MB and 1,000 rows.</p>
        </section>

        <section className="rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-5">
          <h2 className="font-semibold text-emerald-100">After importing</h2>
          <p className="mt-2 text-sm text-emerald-200/80">Imported curated anchors remain pending review. Open the approval queue to select and approve or reject them.</p>
          <Link href="/admin/dashboard/search-anchors/curated-review" className="mt-4 inline-flex rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold hover:bg-emerald-600">Open curated approval queue</Link>
        </section>

        <SearchAnchorCsvUploader />
      </div>
    </main>
  );
}
