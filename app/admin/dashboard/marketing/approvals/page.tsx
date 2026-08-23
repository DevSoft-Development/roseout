import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function MarketingApprovalsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const { data } = await supabaseAdmin
    .from("marketing_approvals")
    .select("id,status,version,created_at,content_item_id,assigned_to,crm_task_id,decision_notes,marketing_content_items(title,status,publish_at,approval_status)")
    .order("created_at", { ascending: false })
    .limit(100);
  const approvals = data || [];

  return (
    <main className="space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Marketing</p>
        <h1 className="text-3xl font-semibold">Approvals</h1>
        <p className="mt-1 text-sm text-neutral-600">Marketing review records are linked to CRM tasks so assignees also receive their normal Microsoft To Do sync.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {['pending','approved','changes_requested','rejected'].map((status) => (
          <div key={status} className="rounded-xl border bg-white p-4">
            <div className="text-2xl font-semibold">{approvals.filter((a) => a.status === status).length}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{status.replaceAll('_',' ')}</div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="divide-y">
          {approvals.length ? approvals.map((approval: any) => {
            const content = Array.isArray(approval.marketing_content_items) ? approval.marketing_content_items[0] : approval.marketing_content_items;
            return (
              <div key={approval.id} className="grid gap-2 px-4 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <div className="font-medium">{content?.title || 'Marketing content'}</div>
                  <div className="mt-1 text-xs text-neutral-500">Version {approval.version} · CRM task {approval.crm_task_id ? 'linked' : 'not linked'}</div>
                </div>
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium capitalize">{approval.status.replaceAll('_',' ')}</span>
                <span className="text-xs text-neutral-500">{new Date(approval.created_at).toLocaleString()}</span>
              </div>
            );
          }) : <div className="px-4 py-10 text-center text-sm text-neutral-500">No marketing approvals yet.</div>}
        </div>
      </div>
    </main>
  );
}
