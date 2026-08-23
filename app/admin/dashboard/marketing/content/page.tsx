import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const stages = [
  ["idea", "Ideas"],
  ["draft", "Draft"],
  ["production", "Production"],
  ["ready_for_review", "Review"],
  ["changes_requested", "Changes"],
  ["approved", "Approved"],
  ["scheduled", "Scheduled"],
  ["published", "Published"],
] as const;

export default async function MarketingContentPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const { data } = await supabaseAdmin
    .from("marketing_content_items")
    .select("id,title,status,priority,publish_at,due_at,approval_status,current_version,created_at")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(250);
  const items = data || [];

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Marketing</p>
          <h1 className="text-3xl font-semibold text-neutral-950">Content Pipeline</h1>
          <p className="mt-1 text-sm text-neutral-600">One master record per idea, with approval and platform publishing downstream.</p>
        </div>
        <Link href="/admin/dashboard/marketing" className="rounded-lg border px-3 py-2 text-sm font-medium">Create from Marketing Center</Link>
      </div>

      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        {stages.map(([key, label]) => (
          <div key={key} className="rounded-xl border bg-white p-4">
            <div className="text-2xl font-semibold">{items.filter((item) => item.status === key).length}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b px-4 py-3 font-semibold">Active content</div>
        <div className="divide-y">
          {items.length ? items.map((item) => (
            <div key={item.id} className="grid gap-2 px-4 py-4 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
              <div>
                <div className="font-medium text-neutral-950">{item.title}</div>
                <div className="mt-1 text-xs text-neutral-500">Version {item.current_version} · {String(item.approval_status).replaceAll("_", " ")}</div>
              </div>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium capitalize">{String(item.status).replaceAll("_", " ")}</span>
              <span className="text-xs font-medium uppercase text-neutral-500">{item.priority}</span>
              <span className="text-xs text-neutral-500">{item.publish_at ? new Date(item.publish_at).toLocaleString() : item.due_at ? `Due ${new Date(item.due_at).toLocaleDateString()}` : "Unscheduled"}</span>
            </div>
          )) : <div className="px-4 py-10 text-center text-sm text-neutral-500">No master content items yet. Existing campaigns and social posts remain available in Marketing Center.</div>}
        </div>
      </div>
    </main>
  );
}
