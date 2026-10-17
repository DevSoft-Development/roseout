import AcquisitionCampaignPanel from "../AcquisitionCampaignPanel";
import FirstLocationDryRun from "../FirstLocationDryRun";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

const SECTIONS: Record<string, { title: string; description: string; links: { title: string; href: string }[] }> = {
  enrichment: {
    title: "Location Data Intelligence",
    description: "Live location-quality and publishing inventory. Advanced enrichment actions are not yet available on the isolated Admin runtime.",
    links: [
      { title: "Hidden location repair", href: "/admin/dashboard/settings/location-tools/hidden-locations" },
      { title: "Market repair", href: "/admin/dashboard/settings/location-tools/markets" },
      { title: "Location health", href: "/admin/dashboard/crm/location-health" },
    ],
  },
  "search-profiles": {
    title: "Search Profiles",
    description: "Search profile diagnostics. Canonical backfill controls are not yet available on this runtime.",
    links: [
      { title: "Location health", href: "/admin/dashboard/crm/location-health" },
      { title: "Markets", href: "/admin/dashboard/settings/location-tools/markets" },
    ],
  },
  "google-discovery": {
    title: "Curated Google Discovery",
    description: "Provider readiness for curated discovery. Paid acquisition remains gated by campaign and provider budgets.",
    links: [
      { title: "Provider controls", href: "/admin/dashboard/settings/location-tools#acquisition-coverage" },
      { title: "Import logs", href: "/admin/dashboard/settings/location-tools/logs" },
    ],
  },
  import: {
    title: "LI V2 Import Operations",
    description: "Live acquisition campaign, candidate rejections, provider costs and safe recovery. AWS runs worker jobs.",
    links: [
      { title: "Import logs", href: "/admin/dashboard/settings/location-tools/logs" },
      { title: "Location health", href: "/admin/dashboard/crm/location-health" },
    ],
  },
  photos: {
    title: "Location Photos",
    description: "Location-photo diagnostics and repair are not yet available on this runtime.",
    links: [{ title: "Location health", href: "/admin/dashboard/crm/location-health" }],
  },
  publishing: {
    title: "Location Publishing",
    description: "Live searchable and hidden-location counts with links to existing publishing repair tools.",
    links: [
      { title: "Hidden location repair", href: "/admin/dashboard/settings/location-tools/hidden-locations" },
      { title: "Market repair", href: "/admin/dashboard/settings/location-tools/markets" },
    ],
  },
};

export default async function LocationToolsSectionPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  await requireAdminRole(["superadmin", "admin"]);
  const { tool } = await params;
  const section = SECTIONS[tool];
  if (!section) notFound();

  const db = getAdminDatabaseClient();
  const [total, searchable, hidden, providers] = await Promise.all([
    db.from("locations").select("id", { count: "exact", head: true }),
    db.from("locations").select("id", { count: "exact", head: true }).eq("is_searchable", true).eq("is_hidden", false),
    db.from("locations").select("id", { count: "exact", head: true }).eq("is_hidden", true),
    db.from("location_provider_registry").select("provider,enabled,health_status").order("provider"),
  ]);
  return (
    <main className="min-h-screen bg-[#080407] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/admin/dashboard/settings/location-tools" className="text-sm font-bold text-rose-300 hover:underline">← Location Tools</Link>
        <section className="rounded-3xl border border-white/10 bg-[#111] p-6">
          <h1 className="text-3xl font-black">{section.title}</h1>
          <p className="mt-3 text-sm text-white/65">{section.description}</p>
        </section>
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Live location counts">
          {[
            ["Total locations", total],
            ["Searchable locations", searchable],
            ["Hidden locations", hidden],
          ].map(([label, result]) => (
            <div key={String(label)} className="rounded-2xl border border-white/10 bg-[#111] p-5">
              <p className="text-sm text-white/60">{String(label)}</p>
              <p className="mt-2 text-2xl font-black">
                {(result as typeof total).error ? "Unavailable" : ((result as typeof total).count ?? 0).toLocaleString()}
              </p>
            </div>
          ))}
        </section>
        {tool === "google-discovery" && (
          <section className="rounded-2xl border border-white/10 bg-[#111] p-5">
            <h2 className="text-xl font-bold">Provider registry</h2>
            {providers.error ? <p className="mt-3">Provider status unavailable.</p> : (
              <ul className="mt-3 space-y-2">
                {(providers.data || []).filter((p) => ["google", "dataforseo", "brave", "serpapi"].includes(p.provider)).map((p) => (
                  <li key={p.provider} className="text-sm">{p.provider}: {p.enabled ? "Enabled" : "Disabled"} · {p.health_status || "Unknown health"}</li>
                ))}
              </ul>
            )}
          </section>
        )}
        {tool === "import" && <AcquisitionCampaignPanel />}
        {tool === "import" && (
          <section className="rounded-2xl border border-white/10 bg-[#111] p-5">
            <h2 className="text-xl font-bold">Superiority Burger certification</h2>
            <p className="mt-2 text-sm text-white/65">Superadmin-only, read-only verification of official business identity and Wikimedia photo attribution. No import, publishing, or paid requests. Authorization flag must be enabled separately.</p>
            <FirstLocationDryRun />
          </section>
        )}
        <section className="rounded-2xl border border-white/10 bg-[#111] p-5">
          <h2 className="text-xl font-bold">Available tools</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {section.links.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-xl border border-white/20 px-4 py-3 text-sm font-bold hover:bg-white/10">{link.title} →</Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
