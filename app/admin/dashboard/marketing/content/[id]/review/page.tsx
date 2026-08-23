import Link from "next/link";
import { notFound } from "next/navigation";
import MarketingApprovalActions from "@/components/marketing/MarketingApprovalActions";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { loadMarketingContent } from "@/lib/marketing/content-operations";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function MarketingContentReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketingApprove);
  const { id } = await params;
  const item = await loadMarketingContent(id).catch(() => null);
  if (!item) notFound();

  const { data: approval } = await supabaseAdmin
    .from("marketing_approvals")
    .select("id,version,status,created_at,decision_notes")
    .eq("content_item_id", id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const platforms = item.selected_platforms || [];
  const copy = item.platform_copy || {};

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Marketing · Approval</p>
          <h1 className="text-3xl font-semibold">{item.title}</h1>
          <p className="mt-1 text-sm text-neutral-600">Reviewing version {approval?.version || item.current_version} · {platforms.join(", ") || "No platforms selected"}</p>
        </div>
        <Link href={`/admin/dashboard/marketing/content/${id}`} className="min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold">Open editor</Link>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 lg:col-span-2">
          <h2 className="font-semibold">Creative</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div><dt className="font-semibold text-neutral-500">Hook</dt><dd className="mt-1 whitespace-pre-wrap text-base">{item.hook || "—"}</dd></div>
            <div><dt className="font-semibold text-neutral-500">Script</dt><dd className="mt-1 whitespace-pre-wrap">{item.script || "—"}</dd></div>
            <div><dt className="font-semibold text-neutral-500">Voiceover</dt><dd className="mt-1 whitespace-pre-wrap">{item.voiceover || "—"}</dd></div>
            <div><dt className="font-semibold text-neutral-500">Master caption</dt><dd className="mt-1 whitespace-pre-wrap">{item.caption || "—"}</dd></div>
            <div><dt className="font-semibold text-neutral-500">CTA</dt><dd className="mt-1 whitespace-pre-wrap">{item.cta || "—"}</dd></div>
          </dl>
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">Publishing plan</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="text-neutral-500">Publish</dt><dd className="font-medium">{item.publish_at ? new Date(item.publish_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "Not scheduled"}</dd></div>
            <div><dt className="text-neutral-500">Mode</dt><dd className="font-medium">{item.auto_publish ? "Automatic after approval" : "Manual publish task"}</dd></div>
            <div><dt className="text-neutral-500">Source</dt><dd className="font-medium capitalize">{item.source_type || "General TheOutHaven"}</dd></div>
            <div><dt className="text-neutral-500">Media</dt><dd className="font-medium">{(item.media_urls || []).length} attached</dd></div>
          </dl>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">Platform copy</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {platforms.map((platform) => <article key={platform} className="rounded-xl border p-4"><h3 className="font-semibold capitalize">{platform}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{typeof copy[platform] === "string" ? String(copy[platform]) : item.caption || "No platform-specific copy yet."}</p></article>)}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">Media</h2>
        {(item.media_urls || []).length ? <div className="mt-3 space-y-2">{(item.media_urls || []).map((url) => <div key={url} className="break-all rounded-lg bg-neutral-50 p-3 text-sm">{url}</div>)}</div> : <p className="mt-2 text-sm text-neutral-500">No media attached.</p>}
      </section>

      {approval ? <MarketingApprovalActions contentId={id} approvalId={approval.id} /> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">There is no pending approval for the current content item.</div>}
    </main>
  );
}
