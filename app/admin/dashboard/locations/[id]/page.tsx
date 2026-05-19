import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";
import ClaimQrCode from "@/components/admin/ClaimQrCode";
import BusinessCommunicationSection from "@/components/admin/business/BusinessCommunicationSection";

export default async function LocationAdminDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const { id } = await params;
  const [r, a] = await Promise.all([
    supabase.from("restaurants").select("*").eq("id", id).maybeSingle(),
    supabase.from("activities").select("*").eq("id", id).maybeSingle(),
  ]);
  const loc: any = r.data || a.data;
  if (!loc) return notFound();

  return <div className="space-y-6 p-6">
    <div className="flex items-center justify-between"><div><h1 className="text-3xl font-bold">{loc.name || loc.restaurant_name || loc.activity_name}</h1><p className="text-sm text-neutral-500">Location command center</p></div><Link href="/admin/dashboard/locations" className="rounded border px-3 py-2">Back</Link></div>

    <section className="grid gap-4 rounded-2xl border p-4 md:grid-cols-3">
      <div className="md:col-span-2 space-y-2"><h2 className="font-semibold">Public Preview</h2><p>{loc.description || "No description."}</p><p>{loc.address} • {loc.city}, {loc.state}</p><p>{loc.phone || "No phone"} • {loc.website || "No website"}</p><a href={loc.reservation_link || "#"} className="text-blue-600">{loc.reservation_link || "No reservation link"}</a></div>
      {loc.image_url ? <img src={loc.image_url} alt="location" className="h-40 w-full rounded-xl object-cover"/> : null}
    </section>

    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border p-4"><h3 className="mb-2 font-semibold">CRM Metrics</h3><p>Opportunity score: {loc.recommendation_score ?? "—"}</p><p>Quality score: {loc.quality_score ?? "—"}</p><p>Claim status: {loc.is_claimed ? "Claimed" : "Unclaimed"}</p></div>
      <div className="rounded-2xl border p-4"><h3 className="mb-2 font-semibold">Claim Access</h3><ClaimQrCode locationId={id} initial={loc} /></div>
      <div className="rounded-2xl border p-4"><h3 className="mb-2 font-semibold">Data Quality + Semantic</h3><p>semantic_search_text: {loc.semantic_search_text ? "Present" : "Missing"}</p><p>intent_tags: {loc.intent_tags ? "Present" : "Missing"}</p><p>coordinates: {loc.latitude && loc.longitude ? "Present" : "Missing"}</p></div>
      <div className="rounded-2xl border p-4"><h3 className="mb-2 font-semibold">Reservation Links</h3><p>{loc.reservation_link || "Missing reservation link"}</p></div>
    </section>

    <section className="rounded-2xl border p-4"><h3 className="mb-2 font-semibold">Communication</h3><BusinessCommunicationSection business={{ id: String(loc.business_id || id), name: String(loc.name || loc.restaurant_name || loc.activity_name || "Location"), crm_status: "new" as any }} /></section>
  </div>;
}
