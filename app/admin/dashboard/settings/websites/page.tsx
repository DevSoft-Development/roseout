import Link from "next/link";
import WebsiteResetClient from "./WebsiteResetClient";

export const dynamic = "force-dynamic";

export default function AdminGeneratedWebsitesPage() {
  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Website operations</p>
            <h1 className="mt-2 text-3xl font-black">Generated Websites</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">Inspect and reset generated websites per location without deleting the underlying location or its registered domain.</p>
          </div>
          <Link href="/admin/dashboard/settings" className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-black hover:bg-white/[0.09]">Back to settings</Link>
        </div>
        <WebsiteResetClient />
      </div>
    </main>
  );
}
