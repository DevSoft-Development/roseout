import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminDataTableShell,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

function tone(status: string): "green" | "amber" | "red" | "blue" | "muted" {
  if (status === "approved") return "green";
  if (status === "pending") return "blue";
  if (status === "changes_requested") return "amber";
  if (status === "rejected") return "red";
  return "muted";
}

export default async function MarketingApprovalsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const { data } = await getAdminDatabaseClient()
    .from("marketing_approvals")
    .select("id,status,version,created_at,content_item_id,assigned_to,crm_task_id,decision_notes,marketing_content_items(title,status,publish_at,approval_status)")
    .order("created_at", { ascending: false })
    .limit(100);
  const approvals = data || [];
  const count = (status: string) => approvals.filter((a) => a.status === status).length;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Marketing · Governance"
        title="Approvals"
        subtitle="Review submitted marketing content versions tied to CRM tasks and Microsoft To Do before publication."
        badge={<AdminStatusBadge tone={count("pending") ? "amber" : "green"}>{count("pending") ? `${count("pending")} pending review` : "Approval queue clear"}</AdminStatusBadge>}
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Pending" value={count("pending")} helper="Needs review" />
        <AdminKpiCard label="Approved" value={count("approved")} helper="Cleared for publishing" />
        <AdminKpiCard label="Changes requested" value={count("changes_requested")} helper="Returned for revision" />
        <AdminKpiCard label="Rejected" value={count("rejected")} helper="Not approved" />
      </AdminKpiGrid>

      <AdminDataTableShell>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Approval ledger</p>
          <h2 className="mt-1 text-xl font-black text-white">Submitted content</h2>
          <p className="mt-1 text-sm text-white/50">Open any pending item to review the exact submitted version.</p>
        </div>
        {approvals.length ? (
          <div className="divide-y divide-white/10">
            {approvals.map((approval: any) => {
              const contentItem = Array.isArray(approval.marketing_content_items) ? approval.marketing_content_items[0] : approval.marketing_content_items;
              const href = approval.status === "pending"
                ? `/admin/dashboard/marketing/content/${approval.content_item_id}/review`
                : `/admin/dashboard/marketing/content/${approval.content_item_id}`;
              return (
                <Link href={href} key={approval.id} className="grid min-h-20 gap-3 px-5 py-4 transition hover:bg-white/[0.025] md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-black text-white">{contentItem?.title || "Marketing content"}</p>
                    <p className="mt-1 text-xs text-white/45">Version {approval.version} · CRM task {approval.crm_task_id ? "linked" : "not linked"}{approval.decision_notes ? ` · ${approval.decision_notes}` : ""}</p>
                  </div>
                  <AdminStatusBadge tone={tone(approval.status)}>{approval.status.replaceAll("_", " ")}</AdminStatusBadge>
                  <span className="text-xs text-white/45">{new Date(approval.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="p-5"><AdminEmptyState title="No marketing approvals yet" body="Submitted content will appear here when an approval workflow is started." /></div>
        )}
      </AdminDataTableShell>
    </AdminPageShell>
  );
}
