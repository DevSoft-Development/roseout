import { revalidatePath } from "next/cache";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminRole } from "@/lib/admin-auth";
import { getMirrorDemoLocation } from "@/lib/demo/demo-center";
import { getDemoOwnerSearchParams } from "@/lib/demo/owner-context";

async function setAcquisitionProvider(formData: FormData) {
  "use server";
  await requireAdminRole(["superadmin", "admin"]);
  const provider = String(formData.get("provider") || "");
  const enabled = String(formData.get("enabled")) === "true";
  if (!["google", "dataforseo", "brave", "serpapi"].includes(provider)) throw new Error("Unsupported acquisition provider");
  const { data, error } = await supabaseAdmin.from("location_provider_registry")
    .update({ enabled, updated_at: new Date().toISOString() }).eq("provider", provider).select("provider");
  if (error || !data?.length) throw new Error(error?.message || "Provider not registered");
  revalidatePath("/admin/dashboard/settings/location-tools");
}

async function setAutomaticReviewRefreshes(formData: FormData) {
  "use server";
  await requireAdminRole(["superadmin", "admin"]);
  const enabled = String(formData.get("enabled") || "") === "true";
  const { data } = await supabaseAdmin.from("location_provider_registry").select("metadata").eq("provider", "dataforseo").maybeSingle();
  const metadata = data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata) ? data.metadata as Record<string, unknown> : {};
  const { error } = await supabaseAdmin.from("location_provider_registry").update({
    metadata: { ...metadata, automatic_review_refresh_enabled: enabled },
    updated_at: new Date().toISOString(),
  }).eq("provider", "dataforseo");
  if (error) throw new Error(error.message);
  revalidatePath("/admin/dashboard/settings/location-tools");
}

export const dynamic = "force-dynamic";

const tools = [
  ["Location Data Intelligence", "Unified database health, Google enrichment, cuisine/category repair, review, and Search Foundation V3 refresh", "Quality", "/admin/dashboard/settings/location-tools/enrichment"],
  ["Search Profiles", "Canonical classification diagnostics and durable backfill runs", "Search", "/admin/dashboard/settings/location-tools/search-profiles"],
  ["Curated Google Discovery", "Review gap-driven Google candidates, nightly outcomes, rejections, and manual restaurant/activity discovery", "Discovery", "/admin/dashboard/settings/location-tools/google-discovery"],
  ["Import", "Google, CSV workflow, NYC, OSM imports, and recent import logs", "Imports", "/admin/dashboard/settings/location-tools/import"],
  ["Duplicates", "Duplicate review now opens inside CRM Location Health", "Review", "/admin/dashboard/crm/location-health#duplicates"],
  ["Hidden Locations", "Review hidden and low-level records, then bulk unhide or make eligible locations searchable", "Repair", "/admin/dashboard/settings/location-tools/hidden-locations"],
  ["Photos", "Diagnostics, Google photo caching, and single-location repair", "Repair", "/admin/dashboard/settings/location-tools/photos"],
  ["Publishing", "Publish readiness and searchable status repair", "Publish", "/admin/dashboard/settings/location-tools/publishing"],
  ["Markets", "Market assignment counts and safe bounded repairs", "Repair", "/admin/dashboard/settings/location-tools/markets"],
  ["Anchor Locations", "Manage the named landmarks, venues, businesses, aliases, and radius policies used by anchored nearby search", "Search", "/admin/dashboard/search-anchors"],
  ["Claim URLs", "Claim code, canonical URL, and QR repair tools", "Claims", "/admin/dashboard/settings/location-tools/claim-urls"],
  ["Logs", "Import and maintenance activity filters", "Logs", "/admin/dashboard/settings/location-tools/logs"],
] as const;

export default async function LocationToolsPage() {
  await requireAdminRole(["superadmin", "admin"]);
  const lounge = await getMirrorDemoLocation().catch(() => null);
  const [coverageResult, registryResult, locationCountResult] = await Promise.all([
    supabaseAdmin.from("location_coverage_state")
      .select("market,location_kind,area_key,priority_score,calculated_at")
      .order("priority_score", { ascending: false }).limit(200),
    supabaseAdmin.from("location_provider_registry")
      .select("provider,enabled,paid,health_status,priority,updated_at")
      .order("priority", { ascending: false }),
    supabaseAdmin.from("locations")
      .select("id", { count: "exact", head: true })
      .eq("is_searchable", true).eq("is_hidden", false)
      .eq("active", true).is("deleted_at", null),
  ]);
  const marketGroups = new Map<string, { areas: Set<string>; highest: number }>();
  for (const row of coverageResult.data || []) {
    const market = String(row.market || "Unknown");
    const current = marketGroups.get(market) || { areas: new Set<string>(), highest: 0 };
    current.areas.add(String(row.area_key || ""));
    current.highest = Math.max(current.highest, Number(row.priority_score || 0));
    marketGroups.set(market, current);
  }
  const providerRows = registryResult.data || [];
  const searchableCount = locationCountResult.count;
  const { data: dataForSeoProvider } = await supabaseAdmin
    .from("location_provider_registry")
    .select("metadata")
    .eq("provider", "dataforseo")
    .maybeSingle();
  const providerMetadata = dataForSeoProvider?.metadata && typeof dataForSeoProvider.metadata === "object" && !Array.isArray(dataForSeoProvider.metadata)
    ? dataForSeoProvider.metadata as Record<string, unknown>
    : {};
  const automaticReviewRefreshes = providerMetadata.automatic_review_refresh_enabled === true;
  const demoParams = lounge?.id
    ? getDemoOwnerSearchParams({
        id: String(lounge.id),
        location_type: lounge.location_type,
        primary_category: lounge.primary_category,
      }).toString()
    : "";
  const dashboardHref = demoParams ? `/locations/dashboard?${demoParams}` : "/admin/dashboard/settings/demo-center";
  const publicHref = lounge?.id && demoParams
    ? `/locations/restaurant/${encodeURIComponent(String(lounge.id))}?${demoParams}`
    : "/admin/dashboard/settings/demo-center";

  return (
    <main className="min-h-screen bg-[#080407] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(236,11,91,.2),transparent_34%),#0d0d0f] p-6">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">Operations</p>
          <h1 className="mt-3 text-4xl font-black">Data Operations</h1>
          <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/60">Technical location-data operations in one workspace: imports, enrichment, classification, publishing, photos, markets, search profiles, and maintenance.</p>
        </section>

        <section id="acquisition-coverage" className="rounded-3xl border border-white/10 bg-[#111] p-6">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">LI V2 Acquisition Workspace</p>
          <h2 className="mt-2 text-2xl font-black">Coverage and provider readiness</h2>
          <p className="mt-2 text-sm font-bold text-white/55">Live read-only diagnostics from the existing coverage planner and provider registry. Paid discovery is not activated by this panel.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 p-4"><p className="text-xs text-white/50">Searchable locations</p><p className="mt-2 text-2xl font-black">{searchableCount == null ? "Unavailable" : searchableCount.toLocaleString()}</p></div>
            <div className="rounded-2xl border border-white/10 p-4"><p className="text-xs text-white/50">Markets in coverage sample</p><p className="mt-2 text-2xl font-black">{coverageResult.error ? "Unavailable" : marketGroups.size}</p></div>
            <div className="rounded-2xl border border-white/10 p-4"><p className="text-xs text-white/50">Paid campaign</p><p className="mt-2 text-lg font-black text-amber-200">Not authorized here</p></div>
          </div>
          {coverageResult.error ? <p className="mt-3 text-sm text-amber-200">Coverage state is currently unavailable.</p> : (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[...marketGroups.entries()].map(([market, summary]) => (
                <div key={market} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-black">{market.replace(/_/g, " ")}</p>
                  <p className="mt-2 text-sm text-white/60">{summary.areas.size} areas in current priority sample · top priority {summary.highest.toFixed(1)}</p>
                </div>
              ))}
            </div>
          )}
          <h3 className="mt-6 text-lg font-black">Provider registry</h3>
          <p className="mt-1 text-xs text-white/50">Registry status is informational. Runtime provider switches and the shared spending cap must also permit execution.</p>
          {registryResult.error ? <p className="mt-3 text-sm text-amber-200">Provider registry unavailable.</p> : (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {providerRows.map((row) => (
                <div key={row.provider} className="rounded-xl border border-white/10 p-3">
                  <div className="flex items-center justify-between gap-2"><span className="font-bold">{row.provider}</span><span className={row.enabled ? "text-emerald-300" : "text-white/50"}>{row.enabled ? "Registered on" : "Registered off"}</span></div>
                  <p className="mt-1 text-xs text-white/50">{row.paid ? "Paid provider" : "No paid-provider flag"} · Health: {row.health_status || "Unknown"}</p>
                  {["google", "dataforseo", "brave", "serpapi"].includes(row.provider) && <form action={setAcquisitionProvider} className="mt-3 flex gap-2"><input type="hidden" name="provider" value={row.provider}/><button name="enabled" value="false" className="rounded-full border border-white/20 px-3 py-1 text-xs">Disable</button><button name="enabled" value="true" className="rounded-full border border-white/20 px-3 py-1 text-xs">Enable</button></form>}
                </div>
              ))}
            </div>
          )}
          <p className="mt-5 text-sm text-white/60">Acquisition budget: the proposed $150 is a ceiling, not an active campaign. Budget reservation, provider fallback and paid end-to-end testing require certification before a Start control is enabled.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/admin/dashboard/settings/location-tools/google-discovery" className="rounded-full border border-white/20 px-4 py-2 text-sm font-black text-white">Existing Discovery</Link>
            <Link href="/admin/dashboard/settings/location-tools/enrichment" className="rounded-full border border-white/20 px-4 py-2 text-sm font-black text-white">Enrichment</Link>
            <Link href="/admin/dashboard/settings/location-tools/logs" className="rounded-full border border-white/20 px-4 py-2 text-sm font-black text-white">Acquisition Logs</Link>
          </div>
        </section>

        <section className="rounded-[2rem] border border-rose-400/30 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,.16),transparent_36%),#111] p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Universal Test Venue</p>
              <h2 className="mt-2 text-2xl font-black">TheOutHaven Lounge</h2>
              <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-white/55">Open the hidden test venue dashboard or start the controlled customer journey without exposing this location to normal public search.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={dashboardHref} className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white transition hover:bg-[#ff174f]">Location Dashboard</Link>
              <Link href="/create?q=TheOutHaven%20Lounge" className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white hover:text-black">Start E2E Demo</Link>
              <Link href={publicHref} className="rounded-full border border-rose-300/25 bg-rose-500/10 px-5 py-3 text-sm font-black text-rose-100 transition hover:bg-rose-500/20">Public View</Link>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#111] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Review Intelligence</p>
              <h2 className="mt-2 text-2xl font-black">Automatic review refreshes</h2>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-white/55">
                Initial DataForSEO review ingest remains 100 newest reviews per location. Automatic repeat refreshes are currently {automaticReviewRefreshes ? "ON" : "OFF"}.
              </p>
            </div>
            <form action={setAutomaticReviewRefreshes} className="flex gap-3">
              <button name="enabled" value="false" className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white">Turn off</button>
              <button name="enabled" value="true" className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white">Turn on</button>
            </form>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tools.map(([title, body, label, href]) => (
            <Link key={href} href={href} className="rounded-3xl border border-white/10 bg-[#111] p-5 transition hover:bg-white/[0.07]">
              <span className="rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-rose-100">{label}</span>
              <h2 className="mt-4 text-xl font-black text-white">{title}</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-white/55">{body}</p>
            </Link>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#111] p-5 text-sm font-bold text-white/65">
          <p className="text-xs font-black uppercase tracking-widest text-white/35">Related CRM workspace</p>
          <p className="mt-2">Browse and work individual location records in <Link className="text-rose-200 underline" href="/admin/dashboard/crm/locations">CRM Locations</Link>, and review duplicate decisions in <Link className="text-rose-200 underline" href="/admin/dashboard/crm/location-health#duplicates">Location Health</Link>.</p>
        </section>
      </div>
    </main>
  );
}
