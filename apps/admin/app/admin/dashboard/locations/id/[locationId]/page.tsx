import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

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
    ["Type", row.location_type], ["Status", row.status], ["Searchable", row.is_searchable === true ? "Yes" : "No"],
    ["Claim status", row.claim_status], ["Rating", row.rating], ["Reviews", row.review_count],
    ["Phone", row.phone], ["Website", row.website], ["Google Place ID", row.google_place_id],
    ["Address", row.address], ["City", row.city], ["State", row.state], ["ZIP", row.zip_code],
    ["Quality status", row.quality_status], ["Photo status", row.photo_status], ["Updated", row.updated_at],
  ];

  return <main className="min-h-screen bg-[#08050b] p-6 text-white"><div className="mx-auto max-w-6xl space-y-6">
    <Link href="/admin/dashboard/locations" className="text-sm font-bold text-rose-200">← Locations</Link>
    <section className="grid gap-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:grid-cols-[1fr_260px]">
      <div><p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Location</p><h1 className="mt-2 text-4xl font-black">{name}</h1><p className="mt-2 text-white/55">{val(row.address)} · {val(row.city)}, {val(row.state)}</p></div>
      {image ? <img src={image} alt={name} className="h-44 w-full rounded-2xl object-cover" /> : <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-white/20 text-white/40">No image</div>}
    </section>
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{fields.map(([label,value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-xs uppercase tracking-wide text-white/40">{label}</div><div className="mt-1 break-words font-bold">{val(value)}</div></div>)}</section>
    <section className="flex flex-wrap gap-2">
      <Link href="/admin/dashboard/crm/location-health" className="rounded-xl border border-white/15 px-4 py-3 font-bold">Location Health</Link>
      <Link href="/admin/dashboard/settings/location-tools" className="rounded-xl border border-white/15 px-4 py-3 font-bold">Location Tools</Link>
    </section>
  </div></main>;
}
