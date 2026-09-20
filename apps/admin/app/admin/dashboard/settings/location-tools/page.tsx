import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";

const MIRROR_DEMO_KEY = "real_location_mirror_demo";

async function getMirrorDemoLocation() {
  const { data, error } = await getAdminDatabaseClient()
    .from("locations")
    .select("id,location_type,type,primary_category")
    .eq("demo_key", MIRROR_DEMO_KEY)
    .maybeSingle();

  if (error) return null;
  return data || null;
}

function getDemoOwnerSearchParams(location: {
  id: string;
  location_type?: string | null;
  type?: string | null;
  primary_category?: string | null;
}) {
  const type = String(
    location.location_type ||
      location.type ||
      location.primary_category ||
      "restaurant",
  )
    .toLowerCase()
    .includes("activ")
    ? "activity"
    : "restaurant";

  return new URLSearchParams({
    adminLocationId: location.id,
    locationId: location.id,
    type,
    demo: "1",
    fromDemoCenter: "1",
  });
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
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Operations · Data"
        title="Data Operations"
        subtitle="Technical location-data operations in one workspace: imports, enrichment, classification, publishing, photos, markets, search profiles, and maintenance."
        badge={<AdminStatusBadge tone="green">Location data workspace</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/locations">Locations</AdminActionButton>}
      />

      <AdminSectionCard className="border-rose-400/20 p-6">
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
      </AdminSectionCard>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tools.map(([title, body, label, href]) => (
            <Link key={href} href={href} className="rounded-3xl border border-white/10 bg-[#111] p-5 transition hover:bg-white/[0.07]">
              <span className="rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-rose-100">{label}</span>
              <h2 className="mt-4 text-xl font-black text-white">{title}</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-white/55">{body}</p>
            </Link>
          ))}
        </section>

      <AdminSectionCard className="p-5 text-sm font-bold text-white/65">
          <p className="text-xs font-black uppercase tracking-widest text-white/35">Related CRM workspace</p>
          <p className="mt-2">Browse and work individual location records in <Link className="text-rose-200 underline" href="/admin/dashboard/crm/locations">CRM Locations</Link>, and review duplicate decisions in <Link className="text-rose-200 underline" href="/admin/dashboard/crm/location-health#duplicates">Location Health</Link>.</p>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
