import Link from "next/link";

export default function AdminSettingsPage() {
  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-black">Settings</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Link href="/admin/dashboard/settings/promo-codes" className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 hover:border-rose-300/40">
            <h2 className="text-xl font-bold text-rose-100">Promo Codes</h2>
            <p className="mt-2 text-sm text-white/70">Create and manage promo codes and view redemptions.</p>
          </Link>

          <Link href="/admin/dashboard/launch-checklist" className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 transition-all hover:border-rose-300/40 hover:shadow-[0_10px_28px_rgba(120,35,60,0.28)]">
            <h2 className="text-xl font-bold text-rose-100">Launch Checklist</h2>
            <p className="mt-2 text-sm text-white/70">Monitor production readiness, payments, SEO, communication systems, reservations, and launch status.</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
