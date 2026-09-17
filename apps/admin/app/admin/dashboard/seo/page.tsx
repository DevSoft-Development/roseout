import { requireAdminRole } from "@theouthaven/auth/admin-session";
import SeoOperationsClient from "./SeoOperationsClient";

export const dynamic = "force-dynamic";

const priorityUrls = [
  "/",
  "/about",
  "/business",
  "/business/plans",
  "/explore",
  "/contact",
] as const;

export default async function SeoOperationsPage() {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">
          Growth Operations
        </p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">SEO Operations Center</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-white/60">
          Inspect public pages, validate search-engine readiness, monitor crawl-critical
          surfaces, and run live SEO audits from the isolated Admin app.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href="https://search.google.com/search-console?resource_id=sc-domain%3Atheouthaven.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-[#e1062a] px-4 py-2 text-sm font-black text-white"
          >
            Open Google Search Console ↗
          </a>
          <a
            href="https://theouthaven.com/sitemap.xml"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-black text-white"
          >
            Open Sitemap ↗
          </a>
        </div>
      </header>

      <SeoOperationsClient priorityUrls={[...priorityUrls]} />

      <section className="grid gap-4 xl:grid-cols-3">
        {[
          ["Google", "Indexing operations", "Use the live inspector first. When a healthy page still shows an older Google copy, complete Request Indexing in Search Console."],
          ["Sitemaps", "Bulk discovery", "The dynamic sitemap remains the primary mechanism for discovery of location and SEO landing pages."],
          ["Governance", "Safe public surface", "Inspection is restricted to TheOutHaven HTTPS domains and checks metadata, canonical, robots, schema, HTTP status, and sitemap inclusion."],
        ].map(([eyebrow, title, copy]) => (
          <article key={title} className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">{eyebrow}</p>
            <h2 className="mt-2 text-xl font-black">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-white/55">{copy}</p>
          </article>
        ))}
      </section>
    </section>
  );
}
