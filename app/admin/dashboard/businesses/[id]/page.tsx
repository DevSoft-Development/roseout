import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { getBusinessCRM, getUpgradeFlags } from "@/lib/admin-crm";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function BusinessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);
  const { id } = await params;
  const business = await getBusinessCRM(id);

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,address,city,state,zip,phone,website,category,cuisine,rating,google_place_id,source_table,source_id,intent_tags")
    .eq("id", id)
    .maybeSingle();

  if (!business && !location) notFound();

  const name = business?.name || location?.name || location?.restaurant_name || location?.activity_name || "Unknown location";
  const flags = business ? getUpgradeFlags(business) : [];

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-white/55">CRM Detail</p>
          <h1 className="mt-2 text-3xl font-black">{name}</h1>
          <p className="mt-2 text-sm text-white/65">{[location?.city, location?.state].filter(Boolean).join(", ")} · {location?.category || "Uncategorized"}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {flags.map((flag) => <span key={flag} className="rounded-full border border-rose-200/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-100">{flag}</span>)}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[["Opportunity Score", business?.opportunity_score ?? 0],["Plan Status", business?.crm_status ?? "Unclaimed"],["Churn Risk", business?.churn_risk_score ?? 0],["Conversion", `${((business?.conversion_rate_30d ?? 0) * 100).toFixed(1)}%`]].map(([label, value]) => (
            <article key={String(label)} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.2em] text-white/55">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-black">Overview</h2>
            <dl className="mt-3 space-y-2 text-sm text-white/80">
              <div><dt className="text-white/55">Address</dt><dd>{location?.address || "—"}</dd></div>
              <div><dt className="text-white/55">Phone</dt><dd>{location?.phone || "—"}</dd></div>
              <div><dt className="text-white/55">Website</dt><dd>{location?.website || "—"}</dd></div>
              <div><dt className="text-white/55">Cuisine/Type</dt><dd>{location?.cuisine || location?.category || "—"}</dd></div>
              <div><dt className="text-white/55">Rating</dt><dd>{location?.rating ?? "—"}</dd></div>
              <div><dt className="text-white/55">Google Place ID</dt><dd>{location?.google_place_id || "—"}</dd></div>
            </dl>
          </article>
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-black">Analytics</h2>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>Views: {business?.profile_views_30d ?? 0}</li>
              <li>Clicks/Search: {business?.search_appearances_30d ?? 0}</li>
              <li>Saves: {business?.saves_30d ?? 0}</li>
              <li>Bookings: {business?.reservation_completions_30d ?? 0}</li>
            </ul>
          </article>
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-black">Claim Codes</h2>
            <p className="mt-3 text-sm text-white/70">Use Admin Locations → Claim Codes for regenerate/revoke. This detail route is now linked from CRM tools.</p>
          </article>
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-black">Outreach / Notes / Promotions</h2>
            <p className="mt-3 text-sm text-white/70">Outreach, notes, reservation link updates, upgrade opportunities, and featured/promotion states are available via admin APIs for this location id.</p>
          </article>
        </section>
      </div>
    </main>
  );
}
