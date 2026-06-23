import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const tools = [
  ["Import", "Google, CSV, NYC, and OSM imports", "/admin/dashboard/settings/location-tools/import"],
  ["Enrichment", "Google enrichment and category correction", "/admin/dashboard/settings/location-tools/enrichment"],
  ["Duplicates", "Dedupe and duplicate review", "/admin/dashboard/settings/location-tools/duplicates"],
  ["Data Quality", "Bad addresses, missing coordinates, and scans", "/admin/dashboard/settings/location-tools/data-quality"],
  ["Photos", "Photo repair and cache utilities", "/admin/dashboard/settings/location-tools/photos"],
  ["Publishing", "Publish readiness and searchable status repair", "/admin/dashboard/settings/location-tools/publishing"],
  ["Markets", "Market assignment repair", "/admin/dashboard/settings/location-tools/markets"],
  ["Claim URLs", "QR and claim URL repair", "/admin/dashboard/settings/location-tools/claim-urls"],
  ["Logs", "Import and maintenance logs", "/admin/dashboard/settings/location-tools/logs"],
] as const;

export default async function LocationToolsPage() {
  await requireAdminRole(["superadmin", "admin"]);
  return <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-6"><section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(236,11,91,.2),transparent_34%),#0d0d0f] p-6"><p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">Admin Settings</p><h1 className="mt-3 text-4xl font-black">Location Tools</h1><p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/60">Technical location database maintenance for imports, enrichment, dedupe, data quality, photos, publishing, markets, QR/claim URL repair, migration tools, and logs.</p></section><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{tools.map(([title, body, href]) => <Link key={href} href={href} className="rounded-3xl border border-white/10 bg-[#111] p-5 transition hover:bg-white/[0.07]"><h2 className="text-xl font-black text-white">{title}</h2><p className="mt-2 text-sm font-bold leading-6 text-white/55">{body}</p></Link>)}</section><section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 text-sm font-bold text-amber-100">Legacy all-location database remains available at <Link className="underline" href="/admin/dashboard/locations">/admin/dashboard/locations</Link> during this consolidation pass.</section></div></main>;
}
