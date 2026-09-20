import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import CuratedReviewClient from "./CuratedReviewClient";
import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function CuratedAnchorReviewPage() {
  const { data, error } = await getAdminDatabaseClient()
    .from("search_anchors")
    .select("id, canonical_name, anchor_type, city, state, market, review_status, latitude, longitude")
    .eq("source_type", "curated")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw error;

  const anchors = data ?? [];
  const pending = anchors.filter((anchor) => anchor.review_status === "pending_review").length;
  const approved = anchors.filter((anchor) => anchor.review_status === "approved").length;
  const rejected = anchors.filter((anchor) => anchor.review_status === "rejected").length;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Search Anchors · Curated Review"
        title="Approve Curated Places"
        subtitle="Review CSV-imported anchors before making them active and searchable."
        badge={
          <AdminStatusBadge tone={pending ? "amber" : "green"}>
            {pending ? `${pending} pending review` : "Curated queue clear"}
          </AdminStatusBadge>
        }
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/search-anchors/upload" variant="primary">Upload CSV</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/search-anchors?view=curated">Curated Places</AdminActionButton>
          </>
        }
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Pending Review" value={pending} helper="Requires approval" />
        <AdminKpiCard label="Approved" value={approved} helper="Ready for search" />
        <AdminKpiCard label="Rejected" value={rejected} helper="Excluded from activation" />
      </AdminKpiGrid>

      <CuratedReviewClient anchors={anchors} />
    </AdminPageShell>
  );
}
