import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
} from "@/components/admin/AdminDesignSystem";
import SeoOperationsClient from "./SeoOperationsClient";

export const dynamic = "force-dynamic";

const priorityUrls = [
  "/",
  "/about",
  "/business",
  "/business/plans",
  "/explore",
  "/contact",
];

export default async function SeoOperationsCenterPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.seoTools);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Growth Operations"
        title="SEO Operations Center"
        subtitle="Inspect public pages, validate search-engine readiness, monitor crawl-critical surfaces, manage recrawl workflows, and keep TheOutHaven discoverable from one command center."
        actions={
          <>
            <AdminActionButton href="https://search.google.com/search-console?resource_id=sc-domain%3Atheouthaven.com" variant="primary">
              Open Google Search Console
            </AdminActionButton>
            <AdminActionButton href="/sitemap.xml">Open Sitemap</AdminActionButton>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Search property", "theouthaven.com", "Google Search Console domain property"],
          ["Primary sitemap", "/sitemap.xml", "Dynamic public URL inventory"],
          ["Indexing workflow", "Operational", "Inspect → validate → submit → verify"],
          ["Manual Google step", "Required", "Google retains final Request Indexing action"],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">{label}</p>
            <p className="mt-2 text-2xl font-black text-white">{value}</p>
            <p className="mt-2 text-xs leading-5 text-white/45">{note}</p>
          </div>
        ))}
      </section>

      <SeoOperationsClient priorityUrls={priorityUrls} />

      <section className="grid gap-4 xl:grid-cols-3">
        <AdminSectionCard className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">Google</p>
          <h2 className="mt-2 text-xl font-black">Indexing operations</h2>
          <p className="mt-3 text-sm leading-6 text-white/55">Use the live inspector here first. When a page is healthy but Google still has an older copy, open Search Console and complete Request Indexing for that URL.</p>
        </AdminSectionCard>
        <AdminSectionCard className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">Sitemaps</p>
          <h2 className="mt-2 text-xl font-black">Bulk discovery</h2>
          <p className="mt-3 text-sm leading-6 text-white/55">The dynamic sitemap remains the primary mechanism for large-scale discovery of location and SEO landing pages. Use URL inspection for priority changes.</p>
        </AdminSectionCard>
        <AdminSectionCard className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">Governance</p>
          <h2 className="mt-2 text-xl font-black">Safe public surface</h2>
          <p className="mt-3 text-sm leading-6 text-white/55">The inspector is restricted to TheOutHaven domains, requires SEO admin access, and reports canonical, robots, metadata, schema, HTTP status, and sitemap inclusion.</p>
        </AdminSectionCard>
      </section>
    </AdminPageShell>
  );
}
