import Link from "next/link";
import MarketingContentEditor from "@/components/marketing/MarketingContentEditor";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

export default async function NewMarketingContentPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketingEdit);
  return (
    <main className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Marketing · Content</p>
          <h1 className="text-3xl font-semibold">Create content</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-600">Build one master content item from a location, outing, event, experience, or offer. It cannot publish until its current version is approved.</p>
        </div>
        <Link href="/admin/dashboard/marketing/content" className="min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold">Back to pipeline</Link>
      </div>
      <MarketingContentEditor />
    </main>
  );
}
