import Link from "next/link";
import FeatureOpportunityButton from "@/components/marketing/FeatureOpportunityButton";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { refreshMarketingContentOpportunities } from "@/lib/marketing/opportunities";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function MarketingOpportunitiesPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  await refreshMarketingContentOpportunities().catch(() => undefined);
  const { data } = await supabaseAdmin
    .from("marketing_content_opportunities")
    .select("id,source_type,source_id,location_id,title,description,image_url,status,featured_content_item_id,discovered_at")
    .in("status", ["new", "saved", "featured"])
    .order("discovered_at", { ascending: false })
    .limit(250);
  const opportunities = data || [];
  const locationIds = [...new Set(opportunities.map((item) => item.location_id).filter(Boolean))] as string[];
  const [{ data: locations }, { data: assetRows }] = await Promise.all([
    locationIds.length ? supabaseAdmin.from("locations").select("id,name,business_name,restaurant_name,activity_name,city,state").in("id", locationIds) : Promise.resolve({ data: [] as any[] }),
    locationIds.length ? supabaseAdmin.from("marketing_assets").select("id,location_id").in("location_id", locationIds).eq("allow_theouthaven_feature", true).in("rights_status", ["owned", "licensed", "permission_granted"]) : Promise.resolve({ data: [] as any[] }),
  ]);
  const byLocation = new Map((locations || []).map((row) => [row.id, row]));
  const assetCounts = new Map<string, number>();
  for (const asset of assetRows || []) assetCounts.set(asset.location_id, (assetCounts.get(asset.location_id) || 0) + 1);

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Marketing</p><h1 className="text-3xl font-semibold">Content Opportunities</h1><p className="mt-1 max-w-3xl text-sm text-neutral-600">Events, experiences, and offers created by locations flow here as potential @TheOutHaven content. Featuring one creates a separate corporate content item; the location’s original record remains untouched.</p></div>
        <Link href="/admin/dashboard/marketing/content" className="min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold">Content Pipeline</Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {opportunities.length ? opportunities.map((item) => {
          const location = item.location_id ? byLocation.get(item.location_id) : null;
          const name = location ? (location.name || location.business_name || location.restaurant_name || location.activity_name) : null;
          return <article key={item.id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold capitalize">{item.source_type}</span><h2 className="mt-3 text-lg font-semibold">{item.title}</h2><p className="mt-1 text-sm text-neutral-500">{name || "Location source"}{location?.city ? ` · ${location.city}${location.state ? `, ${location.state}` : ""}` : ""}</p></div><span className="text-xs font-semibold capitalize text-neutral-500">{item.status}</span></div>
            {item.description ? <p className="mt-4 line-clamp-3 text-sm text-neutral-700">{item.description}</p> : null}
            <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">Approved location media available: <strong>{item.location_id ? assetCounts.get(item.location_id) || 0 : 0}</strong></div>
            <div className="mt-4">{item.featured_content_item_id ? <Link href={`/admin/dashboard/marketing/content/${item.featured_content_item_id}`} className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold">Open created content</Link> : <FeatureOpportunityButton opportunityId={item.id} />}</div>
          </article>;
        }) : <div className="rounded-2xl border bg-white p-10 text-center text-sm text-neutral-500 xl:col-span-2">No active location marketing opportunities yet.</div>}
      </div>
    </main>
  );
}
