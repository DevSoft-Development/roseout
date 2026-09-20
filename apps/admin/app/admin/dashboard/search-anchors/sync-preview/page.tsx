import SyncPreviewClient from "./SyncPreviewClient";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default function SearchAnchorSyncPreviewPage() {
  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Search Anchors · Controlled Rollout"
        title="Dry Run & Approval"
        subtitle="Preview every proposed linked-anchor change, approve the saved plan, then execute only a bounded production batch."
        badge={<AdminStatusBadge tone="amber">Production changes require explicit execution</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/search-anchors">Search Anchors</AdminActionButton>}
      />

        <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 text-sm text-amber-100">
          Running a preview does not change anchors. Approval also does not change anchors. Production records change only after you click Execute Approved Batch and confirm.
        </div>

        <SyncPreviewClient />
    </AdminPageShell>
  );
}
