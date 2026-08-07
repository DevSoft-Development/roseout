import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { getMirrorDemoLocation } from "@/lib/demo/demo-center";
import { getDemoOwnerSearchParams } from "@/lib/demo/owner-context";

export const dynamic = "force-dynamic";

const tools = [
  ["Search Profiles", "Canonical classification profiles, diagnostics, and durable backfill runs", "Search", "/admin/dashboard/settings/location-tools/search-profiles"],
  ["Import", "Google, CSV workflow, NYC, OSM imports, and recent import logs", "Imports", "/admin/dashboard/settings/location-tools/import"],
  ["Enrichment", "Google enrichment review and high-value category correction", "Review", "/admin/dashboard/settings/location-tools/enrichment"],
  ["Duplicates", "Bounded duplicate scans and staged match decisions", "Review", "/admin/dashboard/settings/location-tools/duplicates"],
  ["Data Quality", "Missing addresses, coordinates, photos, categories, and search metadata", "Repair", "/admin/dashboard/settings/location-tools/data-quality"],
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
          <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">Admin Settings</p>
          <h1 className="mt-3 text-4xl font-black">Location Tools</h1>
          <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/60">Operations hub for technical location database maintenance: imports, enrichment, dedupe, quality checks, hidden-location repair, photos, publishing, markets, anchor locations, claim URLs, and logs.</p>
        </section>

        <section className="rounded-[2rem] border border-rose-400/30 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,.16),transparent_36%),#111] p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Universal Test Venue</p>
              <h2 className="mt-2 text-2xl font-black">TheOutHaven Lounge</h2>
              <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-white/55">Open the hidden test venue dashboard or start the controlled customer journey from /create without exposing this location to normal public search.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={dashboardHref} className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white transition hover:bg-[#ff174f]">Location Dashboard</Link>
              <Link href="/create?q=TheOutHaven%20Lounge" className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white hover:text-black">Start E2E Demo</Link>
              <Link href={publicHref} className="rounded-full border border-rose-300/25 bg-rose-500/10 px-5 py-3 text-sm font-black text-rose-100 transition hover:bg-rose-500/20">Public View</Link>
            </div>
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
          <p className="text-xs font-black uppercase tracking-widest text-white/35">Related</p>
          <p className="mt-2">Browse and edit individual records in the <Link className="text-rose-200 underline" href="/admin/dashboard/locations">all-location database</Link>.</p>
        </section>
      </div>
    </main>
  );
}
