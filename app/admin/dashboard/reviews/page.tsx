import Link from "next/link";

export default function AdminReviewsPage() {
  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-28 text-white sm:px-6 lg:px-10">
      <section className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-rose-200/70">Admin · Reviews</p>
        <h1 className="mt-3 text-3xl font-black">Review moderation dashboard</h1>
        <p className="mt-3 max-w-3xl text-sm text-white/70">
          This page is ready for the merged review workflow (pending/approved/rejected, moderation flags,
          and approval actions). Connect your review APIs here to manage location reviews safely.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/admin/dashboard" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 hover:bg-white/10">Back to dashboard</Link>
          <Link href="/admin/dashboard/users" className="rounded-xl border border-rose-300/25 bg-gradient-to-r from-rose-900/30 to-amber-900/20 px-4 py-2">Manage users</Link>
        </div>
      </section>
    </main>
  );
}
