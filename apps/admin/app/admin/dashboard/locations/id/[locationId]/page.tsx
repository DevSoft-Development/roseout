import { notFound } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

function val(value: unknown, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export default async function LocationDetailPage({ params }: { params: Promise<{ locationId: string }> }) {
  await requireAdminRole(["superadmin", "admin", "editor", "reviewer", "viewer"]);
  const { locationId } = await params;
  const { data, error } = await getAdminDatabaseClient().from("locations").select("*").eq("id", locationId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) notFound();

  const row = data as Record<string, unknown>;
  const name = val(row.name || row.restaurant_name || row.activity_name, "Unnamed location");
  const image = val(row.main_image || row.image_url, "");
  const fields: Array<[string, unknown]> = [
    ["Phone", row.phone], ["Website", row.website], ["Google Place ID", row.google_place_id],
    ["Address", row.address], ["City", row.city], ["State", row.state], ["ZIP", row.zip_code],
    ["Quality status", row.quality_status], ["Photo status", row.photo_status], ["Updated", row.updated_at],
  ];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Locations · Record Detail"
        title={name}
        subtitle={`${val(row.address)} · ${val(row.city)}, ${val(row.state)}`}
        badge={<AdminStatusBadge tone={row.is_searchable === true ? "green" : "amber"}>{row.is_searchable === true ? "Searchable" : "Not searchable"}</AdminStatusBadge>}
        actions={<><AdminActionButton href="/admin/dashboard/locations">Locations Directory</AdminActionButton><AdminActionButton href="/admin/dashboard/settings/location-tools" variant="primary">Location Tools</AdminActionButton></>}
      />
      <section className="grid gap-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:grid-cols-[1fr_260px]">
        <div className="grid content-start gap-3 sm:grid-cols-2">
          <div><p className="text-xs uppercase tracking-wide text-white/40">Type</p><p className="mt-1 font-black">{val(row.location_type)}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-white/40">Status</p><p className="mt-1 font-black">{val(row.status)}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-white/40">Claim status</p><p className="mt-1 font-black">{val(row.claim_status)}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-white/40">Rating</p><p className="mt-1 font-black">{val(row.rating)} · {val(row.review_count, "0")} reviews</p></div>
        </div>
        {image ? <img src={image} alt={name} className="h-44 w-full rounded-2xl object-cover" /> : <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-white/20 text-white/40">No image</div>}
      </section>
      <AdminKpiGrid>
        <AdminKpiCard label="Search visibility" value={row.is_searchable === true ? "Public" : "Hidden"} helper="Consumer search state" />
        <AdminKpiCard label="Quality" value={val(row.quality_status)} helper="Data quality state" />
        <AdminKpiCard label="Photos" value={val(row.photo_status)} helper="Photo coverage" />
      </AdminKpiGrid>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{fields.map(([label,value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-xs uppercase tracking-wide text-white/40">{label}</div><div className="mt-1 break-words font-bold">{val(value)}</div></div>)}</section>
      <div className="flex flex-wrap gap-2"><AdminActionButton href="/admin/dashboard/crm/location-health">Location Health</AdminActionButton></div>
    </AdminPageShell>
  );
}
