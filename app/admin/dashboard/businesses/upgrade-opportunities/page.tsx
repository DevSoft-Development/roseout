import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";

export default async function Page() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 text-white">
      <div className="rounded-3xl border border-white/10 bg-[#120d0b] p-8 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200/70">Admin CRM</p>
        <h1 className="mt-2 text-3xl font-black">Coming soon</h1>
        <p className="mt-3 text-white/70">This workspace is ready for CRM data once enabled. Your existing admin tools remain unchanged.</p>
        <Link href="/admin/dashboard/business-crm" className="mt-6 inline-block rounded-xl border border-white/15 px-4 py-2 text-sm font-bold">Back to CRM Pipeline</Link>
      </div>
    </main>
  );
}
