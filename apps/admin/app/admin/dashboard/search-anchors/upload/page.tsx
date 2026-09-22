import Link from "next/link";
import SearchAnchorCsvUploader from "./SearchAnchorCsvUploader";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default function SearchAnchorUploadPage() {
  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Search Anchors · Import"
        title="CSV Uploader"
        subtitle="Validate and import curated anchor CSV files without using the terminal."
        badge={<AdminStatusBadge tone="blue">Curated import workflow</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/search-anchors/curated-review" variant="primary">Approve Curated List</AdminActionButton>
            <a href="/templates/search-anchor-import-template.csv" download className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-soft)] px-4 py-2 text-sm font-black text-[var(--admin-shell-text)]">Download Template</a>
            <AdminActionButton href="/admin/dashboard/search-anchors">Search Anchors</AdminActionButton>
          </>
        }
      />

        <section className="rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)] p-5 text-sm text-[var(--admin-shell-text)]">
          <h2 className="font-semibold text-[var(--admin-shell-text)]">Required columns</h2>
          <p className="mt-2">canonical_name, anchor_type, latitude, longitude, default_radius_miles, max_radius_miles, and radius_strategy.</p>
          <p className="mt-2 text-[var(--admin-shell-muted)]">Coordinate aliases such as lat/lng, lat/lon, and lat/long are normalized automatically. Files are limited to 2 MB and 1,000 rows.</p>
        </section>

        <section className="rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-5">
          <h2 className="font-semibold text-emerald-100">After importing</h2>
          <p className="mt-2 text-sm text-emerald-200/80">Imported curated anchors remain pending review. Open the approval queue to select and approve or reject them.</p>
          <Link href="/admin/dashboard/search-anchors/curated-review" className="mt-4 inline-flex rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold hover:bg-emerald-600">Open curated approval queue</Link>
        </section>

        <SearchAnchorCsvUploader />
    </AdminPageShell>
  );
}
