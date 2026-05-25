import Link from "next/link";

export default function AdminLocationNotFound() {
  return (
    <main className="min-h-screen bg-[#f8f3ef] p-6 text-[#1b1210]">
      <div className="mx-auto max-w-3xl rounded-3xl border border-black/10 bg-white p-8">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-black/45">Admin CRM Location</p>
        <h1 className="mt-2 text-3xl font-black">Location not found</h1>
        <p className="mt-3 text-sm text-black/65">
          We could not find that location record. It may have been deleted, or the URL may be invalid.
        </p>
        <Link
          href="/admin/dashboard/locations"
          className="mt-5 inline-block rounded-full border border-black/10 bg-[#f5eee8] px-5 py-2 text-sm font-black text-[#1b1210] transition hover:bg-[#1b1210] hover:text-white"
        >
          Back to Locations
        </Link>
      </div>
    </main>
  );
}
