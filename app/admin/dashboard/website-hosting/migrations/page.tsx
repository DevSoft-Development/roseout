import type { Metadata } from "next";
import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";
import { WebsiteHostingTabs } from "@/components/admin/WebsiteHostingTabs";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const metadata: Metadata = {
  title: "Website Migrations | Admin",
  description: "Monitor hosted website imports, review, domain connection, and cutover readiness.",
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
  updated_at: string | null;
  custom_content: Record<string, any> | null;
};

function migrationState(site: WebsiteRow) {
  const imported = site.custom_content?.website_import;
  if (!imported) return null;
  if (site.last_error || site.deployment_status === "failed") return "failed";
  if (imported.review_status !== "approved") return imported.review_status === "needs_changes" ? "needs_changes" : "review_required";
  if (site.domain) {
    if (!["verified", "configured", "active"].includes(String(site.dns_status || "").toLowerCase())) return "dns_pending";
    if (String(site.ssl_status || "").toLowerCase() !== "active") return "ssl_pending";
  }
  if (site.status === "live" && site.last_publish_status === "published") return "live";
  if (site.deployment_status === "deploying" || site.last_publish_status === "publishing") return "publishing";
  return "ready_for_publish";
}

function tone(value: string): "green" | "amber" | "rose" | "muted" {
  if (value === "live") return "green";
  if (value === "failed") return "rose";
  if (["needs_changes", "review_required", "dns_pending", "ssl_pending", "publishing"].includes(value)) return "amber";
  return "muted";
}

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function WebsiteMigrationsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);

  const { data, error } = await supabaseAdmin
    .from("business_websites")
    .select("id,location_id,domain,platform_domain,status,deployment_status,dns_status,ssl_status,last_publish_status,last_error,updated_at,custom_content")
    .order("updated_at", { ascending: false });

  const rows = ((data || []) as WebsiteRow[])
    .map((site) => ({ site, state: migrationState(site) }))
    .filter((entry): entry is { site: WebsiteRow; state: string } => Boolean(entry.state));

  const review = rows.filter((entry) => ["review_required", "needs_changes"].includes(entry.state)).length;
  const domainPending = rows.filter((entry) => ["dns_pending", "ssl_pending"].includes(entry.state)).length;
  const ready = rows.filter((entry) => entry.state === "ready_for_publish").length;
  const live = rows.filter((entry) => entry.state === "live").length;
  const failed = rows.filter((entry) => entry.state === "failed").length;

  return <AdminPageShell>
    <AdminPageHeader
      eyebrow="Website Operations"
      title="Website Migrations"
      subtitle="Track imported websites from analysis through review, domain setup, publish, and cutover without leaving the existing hosting control plane."
      actions={<><AdminActionButton href="/admin/dashboard/website-hosting">Hosting Overview</AdminActionButton><AdminActionButton href="/admin/dashboard/website-hosting/migrations" variant="primary">Refresh</AdminActionButton></>}
    />

    <WebsiteHostingTabs active="migrations" />

    {error ? <AdminSectionCard className="border-rose-300/30 bg-rose-500/10 p-5"><p className="font-black text-rose-100">Migration telemetry could not be loaded.</p><p className="mt-2 text-sm text-rose-100/70">{error.message}</p></AdminSectionCard> : null}

    <AdminKpiGrid>
      <AdminKpiCard label="Imported sites" value={rows.length} helper={`${live} live`} />
      <AdminKpiCard label="Needs review" value={review} helper="Owner approval required before publish" />
      <AdminKpiCard label="Domain pending" value={domainPending} helper="DNS or SSL still connecting" />
      <AdminKpiCard label="Ready to publish" value={ready} helper="Review complete and no domain blocker" />
      <AdminKpiCard label="Failed" value={failed} helper="Needs operational attention" />
    </AdminKpiGrid>

    <AdminSectionCard className="p-5">
      <div className="mb-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Migration queue</p><h2 className="mt-1 text-2xl font-black">Imported website status</h2></div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-white/35"><tr><th className="px-3 py-3">Location</th><th className="px-3 py-3">Platform</th><th className="px-3 py-3">Domain</th><th className="px-3 py-3">Migration</th><th className="px-3 py-3">Pages</th><th className="px-3 py-3">Redirects</th><th className="px-3 py-3">Updated</th></tr></thead>
          <tbody className="divide-y divide-white/10">
            {rows.map(({ site, state }) => {
              const imported = site.custom_content?.website_import || {};
              const manifest = imported.migration_manifest || {};
              const domain = site.domain || site.platform_domain || "Subdomain assigned on publish";
              return <tr key={site.id} className="align-top">
                <td className="px-3 py-4"><p className="font-black text-white">{site.location_id}</p>{site.last_error ? <p className="mt-1 max-w-xs text-xs text-rose-200">{site.last_error}</p> : null}</td>
                <td className="px-3 py-4 text-white/65">{imported.provider || imported.adapter_id || "Detected"}</td>
                <td className="px-3 py-4 text-white/65">{domain}</td>
                <td className="px-3 py-4"><AdminStatusBadge tone={tone(state)}>{label(state)}</AdminStatusBadge></td>
                <td className="px-3 py-4 text-white/65">{manifest.page_count || 0}</td>
                <td className="px-3 py-4 text-white/65">{Array.isArray(manifest.redirect_map) ? manifest.redirect_map.length : 0}</td>
                <td className="px-3 py-4 text-white/45">{site.updated_at ? new Date(site.updated_at).toLocaleString() : "—"}</td>
              </tr>;
            })}
            {!rows.length ? <tr><td className="px-3 py-6 text-white/45" colSpan={7}>No imported websites are currently in the migration pipeline.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </AdminSectionCard>
  </AdminPageShell>;
}
