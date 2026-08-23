import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function MarketingCalendarPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 30);
  const { data } = await supabaseAdmin
    .from("marketing_content_items")
    .select("id,title,status,publish_at,approval_status,priority")
    .gte("publish_at", now.toISOString())
    .lte("publish_at", end.toISOString())
    .order("publish_at", { ascending: true });
  const items = data || [];

  return (
    <main className="space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Marketing</p>
        <h1 className="text-3xl font-semibold">Publishing Calendar</h1>
        <p className="mt-1 text-sm text-neutral-600">Upcoming approved and planned content. Human work remains in CRM Tasks; this calendar is the publication plan.</p>
      </div>
      <div className="rounded-xl border bg-white">
        <div className="border-b px-4 py-3 font-semibold">Next 30 days</div>
        <div className="divide-y">
          {items.length ? items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
              <div>
                <div className="font-medium">{item.title}</div>
                <div className="mt-1 text-xs text-neutral-500">{item.publish_at ? new Date(item.publish_at).toLocaleString() : ""}</div>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 capitalize">{String(item.status).replaceAll("_", " ")}</span>
                <span className="rounded-full border px-2.5 py-1 capitalize">{String(item.approval_status).replaceAll("_", " ")}</span>
              </div>
            </div>
          )) : <div className="px-4 py-10 text-center text-sm text-neutral-500">Nothing scheduled in the next 30 days.</div>}
        </div>
      </div>
    </main>
  );
}
