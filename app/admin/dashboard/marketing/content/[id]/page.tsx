import Link from "next/link";
import { notFound } from "next/navigation";
import MarketingContentEditor from "@/components/marketing/MarketingContentEditor";
import MarketingPublishNowButton from "@/components/marketing/MarketingPublishNowButton";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { loadMarketingContent } from "@/lib/marketing/content-operations";

export const dynamic = "force-dynamic";

export default async function MarketingContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.marketingEdit);
  const { id } = await params;
  const item = await loadMarketingContent(id).catch(() => null);
  if (!item) notFound();
  const canPublish = ADMIN_PAGE_ACCESS.marketingPublish.includes(admin.role);
  const currentVersionApproved = item.approval_status === "approved" && item.approved_version === item.current_version;

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Marketing · Content</p>
          <h1 className="text-3xl font-semibold">{item.title}</h1>
          <p className="mt-1 text-sm text-neutral-600">Status: {item.status.replaceAll("_", " ")} · Approval: {item.approval_status.replaceAll("_", " ")} · Version {item.current_version}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPublish && currentVersionApproved ? <MarketingPublishNowButton contentId={item.id} /> : null}
          {item.approval_status === "pending" && ADMIN_PAGE_ACCESS.marketingApprove.includes(admin.role) ? <Link href={`/admin/dashboard/marketing/content/${item.id}/review`} className="min-h-11 rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white">Open review</Link> : null}
          <Link href="/admin/dashboard/marketing/content" className="min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold">Pipeline</Link>
        </div>
      </div>
      <MarketingContentEditor item={item} />
    </main>
  );
}
