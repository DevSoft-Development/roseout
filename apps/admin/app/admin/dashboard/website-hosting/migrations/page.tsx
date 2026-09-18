import type { Metadata } from "next";
import Link from "next/link";

import { ADMIN_ROLES } from "@theouthaven/auth/admin-roles";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { WebsiteHostingTabs } from "@/components/admin/WebsiteHostingTabs";

export const metadata: Metadata = {
  title: "Website Migrations | Admin",
  description: "Monitor hosted website imports, review, domain connection, live health, and cutover readiness.",
};
export const dynamic = "force-dynamic";

type WebsiteRow = {
  id: string;
  location_id: string;
  domain: string | null;
  platform_domain: string | null;
  status: string | null;
  deployment_status: string | null;
  dns_status: string | null;
  ssl_status: string | null;
  last_publish_status: string | null;
  last_error: string | null;
  last_health_check_at: string | null;
  updated_at: string | null;
  custom_content: Record<string, any> | null;
};

const STALE_CONNECTION_MS = 60 * 60 * 1000;
const STALE_HEALTH_MS = 30 * 60 * 1000;

function ageMs(value: string | null) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? Date.now() - parsed : Number.POSITIVE_INFINITY;
}

function migrationState(site: WebsiteRow) {
  const imported = site.custom_content?.website_import;
  if (!imported) return null;
  if (site.deployment_status === "failed" || site.last_publish_status === "failed") return "failed";
  if (site.last_error === "website_unreachable") return "site_unreachable";
  if (site.last_error === "reservation_link_unreachable") return "booking_link_broken";
  if (site.last_error === "website_seo_endpoint_unhealthy") return "seo_attention";
  if (imported.review_status !== "approved") return imported.review_status === "needs_changes" ? "needs_changes" : "review_required";
  if (site.domain) {
    if (!["verified", "configured", "active"].includes(String(site.dns_status || "").toLowerCase())) return ageMs(site.updated_at) > STALE_CONNECTION_MS ? "dns_stalled" : "dns_pending";
    if (String(site.ssl_status || "").toLowerCase() !== "active") return ageMs(site.updated_at) > STALE_CONNECTION_MS ? "ssl_stalled" : "ssl_pending";
  }
  if (site.status === "live" && site.last_publish_status === "published") return ageMs(site.last_health_check_at) > STALE_HEALTH_MS ? "health_stale" : "live";
  if (site.deployment_status === "deploying" || site.last_publish_status === "publishing") return "publishing";
  return "ready_for_publish";
}

function badgeClass(value: string) {
  if (value === "live") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (["failed", "site_unreachable", "booking_link_broken", "dns_stalled", "ssl_stalled"].includes(value)) return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  if (["needs_changes", "review_required", "dns_pending", "ssl_pending", "publishing", "seo_attention", "health_stale"].includes(value)) return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  return "border-white/10 bg-white/[0.04] text-white/60";
}

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function WebsiteMigrationsPage() {
  await requireAdminRole([...ADMIN_ROLES]);
  const { data, error } = await getAdminDatabaseClient()
    .from("business_websites")
    .select("id,location_id,domain,platform_domain,status,deployment_status,dns_status,ssl_status,last_publish_status,last_error,last_health_check_at,updated_at,custom_content")
    .order("updated_at", { ascending: false });

  const rows = ((data || []) as WebsiteRow[])
    .map((site) => ({ site, state: migrationState(site) }))
    .filter((entry): entry is { site: WebsiteRow; state: string } => Boolean(entry.state));

  const review = rows.filter((entry) => ["review_required", "needs_changes"].includes(entry.state)).length;
  const domainPending = rows.filter((entry) => ["dns_pending", "ssl_pending", "dns_stalled", "ssl_stalled"].includes(entry.state)).length;
  const live = rows.filter((entry) => entry.state === "live").length;
  const healthAttention = rows.filter((entry) => ["site_unreachable", "booking_link_broken", "seo_attention", "health_stale"].includes(entry.state)).length;
  const failed = rows.filter((entry) => entry.state === "failed").length;

  const metrics = [
    ["Imported sites", rows.length, `${live} healthy live`],
    ["Needs review", review, "Owner approval required before publish"],
    ["Domain attention", domainPending, "DNS or SSL pending/stalled"],
    ["Live health attention", healthAttention, "Site, booking, SEO, or stale-check issue"],
    ["Failed deployment", failed, "Needs operational attention"],
  ];

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[.26em] text-rose-300">Website Operations</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black sm:text-4xl">Website Migrations</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
                Track imported websites from analysis through review, domain setup, publish, cutover, and live health without leaving the hosting control plane.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/admin/dashboard/website-hosting" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-black">Hosting Overview</Link>
              <Link href="/admin/dashboard/website-hosting/migrations" className="rounded-xl bg-white px-4 py-2 text-sm font-black text-black">Refresh</Link>
            </div>
          </div>
        </header>

        <WebsiteHostingTabs active="migrations" />

        {error ? (
          <section className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">
            Migration telemetry could not be loaded: {error.message}
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {metrics.map(([name, value, helper]) => (
            <article key={String(name)} className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-white/40">{name}</p>
              <p className="mt-2 text-3xl font-black">{value}</p>
              <p className="mt-1 text-xs text-white/45">{helper}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          <p className="text-xs font-black uppercase tracking-[.2em] text-rose-200">Migration queue</p>
          <h2 className="mt-1 text-2xl font-black">Imported website status</h2>
          <p className="mt-1 text-sm text-white/50">Review imported content, publish readiness, domain connection, and live-health blockers.</p>

          <div className="mt-5 grid gap-3">
            {rows.map(({ site, state }) => {
              const imported = site.custom_content?.website_import || {};
              const host = site.domain || site.platform_domain || "Domain pending";
              return (
                <article key={site.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-black">{host}</p>
                      <p className="mt-1 text-xs text-white/40">Location {site.location_id}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${badgeClass(state)}`}>{label(state)}</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-white/10 p-3"><p className="text-[10px] uppercase text-white/35">Review</p><p className="mt-1 font-black capitalize">{String(imported.review_status || "unknown").replaceAll("_"," ")}</p></div>
                    <div className="rounded-xl border border-white/10 p-3"><p className="text-[10px] uppercase text-white/35">Publish</p><p className="mt-1 font-black capitalize">{String(site.last_publish_status || site.deployment_status || "unknown").replaceAll("_"," ")}</p></div>
                    <div className="rounded-xl border border-white/10 p-3"><p className="text-[10px] uppercase text-white/35">DNS</p><p className="mt-1 font-black capitalize">{String(site.dns_status || "unknown").replaceAll("_"," ")}</p></div>
                    <div className="rounded-xl border border-white/10 p-3"><p className="text-[10px] uppercase text-white/35">SSL</p><p className="mt-1 font-black capitalize">{String(site.ssl_status || "unknown").replaceAll("_"," ")}</p></div>
                  </div>
                  {site.last_error ? <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-500/10 p-3 text-xs font-bold text-rose-100">{site.last_error.replaceAll("_"," ")}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-3 text-xs font-black">
                    <Link href={`/admin/dashboard/locations/${site.location_id}`} className="text-rose-200">Open location</Link>
                    <Link href="/admin/dashboard/website-hosting" className="text-white/65">Hosting overview</Link>
                    <span className="text-white/35">Updated {site.updated_at ? new Date(site.updated_at).toLocaleString() : "never"}</span>
                  </div>
                </article>
              );
            })}
            {!rows.length ? <p className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-white/50">No imported website migrations are currently tracked.</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
