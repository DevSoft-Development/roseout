import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { ACTIVE_MARKET_STATES, evaluateLocationPublishability } from "@/lib/location-publishability";
import NonSearchableClient from "./NonSearchableClient";
import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";
export const metadata = { title: "Non-Searchable Locations" };

const SELECT =
  "id,name,state,status,data_status,quality_status,source_quality_status,import_confidence,public_visibility_tier,duplicate_status,is_searchable,is_hidden,is_low_level,has_photos,photo_status,main_image,image_url,images,address,city,latitude,longitude,location_type";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminRole(["superadmin", "admin"]);
  const supabaseAdmin = getAdminDatabaseClient();
  const sp = await searchParams;

  let q = supabaseAdmin
    .from("locations")
    .select(SELECT)
    .eq("is_searchable", false)
    .limit(100)
    .order("updated_at", { ascending: false });

  if (sp.state) q = q.eq("state", sp.state);
  else q = q.in("state", [...ACTIVE_MARKET_STATES]);
  if (sp.locationType) q = q.eq("location_type", sp.locationType);
  if (sp.city) q = q.ilike("city", `%${sp.city}%`);
  if (sp.query) q = q.or(`name.ilike.%${sp.query}%,address.ilike.%${sp.query}%`);

  const { data = [] } = await q;
  const rows = (data || []).map((row: any) => ({
    ...row,
    publishability: evaluateLocationPublishability(row, { allowApproval: true }),
  }));

  const eligible = rows.filter((row: any) => row.publishability?.publishable).length;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Locations · Visibility"
        title="Non-Searchable Locations"
        subtitle="Review locations that are not currently public/searchable, understand why, and safely approve eligible rows."
        badge={
          <AdminStatusBadge tone={rows.length ? "amber" : "green"}>
            {rows.length ? `${rows.length} locations in review` : "Queue clear"}
          </AdminStatusBadge>
        }
        actions={<AdminActionButton href="/admin/dashboard/locations">Locations Directory</AdminActionButton>}
      />

      <AdminKpiGrid>
        <AdminKpiCard label="In Review" value={rows.length} helper="Current filtered result set" />
        <AdminKpiCard label="Eligible to Approve" value={eligible} helper="Passes publishability checks" />
        <AdminKpiCard label="Market States" value={ACTIVE_MARKET_STATES.length} helper="Default active-market scope" />
      </AdminKpiGrid>

      <NonSearchableClient
        rows={rows}
        filters={{
          state: sp.state,
          locationType: sp.locationType,
          city: sp.city,
          query: sp.query,
        }}
      />
    </AdminPageShell>
  );
}
