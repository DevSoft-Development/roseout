import type { Metadata } from "next";

import { ADMIN_ROLES } from "@theouthaven/auth/admin-roles";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { WebsiteHostingTabs } from "@/components/admin/WebsiteHostingTabs";
import { getDomainGatewayStatus } from "@/lib/domains/gateway";
import { WEBSITE_COMPOSITION_PROFILES } from "@/lib/websites/composition-profiles";
import { WEBSITE_DESIGN_DIRECTIONS } from "@/lib/websites/design-directions";
import { loadWebsiteProductionVerification } from "@/lib/websites/production-verification";

export const metadata: Metadata = {
  title: "Website Verification | Admin",
  description: "Verify hosted website production state, domain paths, replicas, registrar readiness, and premium design coverage.",
};
export const dynamic = "force-dynamic";

function stateClass(state: "healthy" | "attention" | "blocked") {
  if (state === "healthy") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (state === "blocked") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  return "border-amber-400/25 bg-amber-400/10 text-amber-100";
}
function profileSignature(id: string) {
  const profile = WEBSITE_COMPOSITION_PROFILES[id];
  if (!profile) return "missing";
  return [profile.nav,profile.hero,profile.sectionOrder.join(">"),profile.reservationPlacement,profile.radius,profile.maxWidth,profile.displayScale,profile.eyebrowTracking,profile.imageRatio,profile.sectionRule].join("|");
}
function GatewayCheck({ label, ok, warningOnly = false }: { label: string; ok: boolean; warningOnly?: boolean }) {
  const klass = ok ? "border-emerald-300/15 bg-emerald-500/5" : warningOnly ? "border-amber-300/20 bg-amber-500/10" : "border-rose-300/20 bg-rose-500/10";
  return <div className={`rounded-xl border px-4 py-3 ${klass}`}><div className="flex items-center justify-between gap-2"><p className="text-sm font-black text-white">{label}</p><span className={`text-[10px] font-black uppercase ${ok ? "text-emerald-200" : warningOnly ? "text-amber-200" : "text-rose-200"}`}>{ok ? "Ready" : "Not ready"}</span></div></div>;
}

export default async function WebsiteVerificationPage() {
  await requireAdminRole([...ADMIN_ROLES]);

  const [rows, gatewayStatus] = await Promise.all([
    loadWebsiteProductionVerification(),
    getDomainGatewayStatus().catch((error) => ({
      ok: false, authenticated: false, registrationEnabled: false, renewalEnabled: false, dnsChangesEnabled: false,
      error: error instanceof Error ? error.message : "domain_gateway_unreachable",
    })),
  ]);

  const healthy = rows.filter((row) => row.state === "healthy").length;
  const attention = rows.filter((row) => row.state === "attention").length;
  const blocked = rows.filter((row) => row.state === "blocked").length;
  const subdomains = rows.filter((row) => !row.domain && row.platformDomain).length;
  const customDomains = rows.filter((row) => Boolean(row.domain)).length;
  const registrarHealthy = Boolean(gatewayStatus.ok && gatewayStatus.authenticated && gatewayStatus.registrationEnabled && gatewayStatus.dnsChangesEnabled);

  const signatures = WEBSITE_DESIGN_DIRECTIONS.map((direction) => ({ direction, signature: profileSignature(direction.id) }));
  const signatureCounts = new Map<string, number>();
  for (const item of signatures) signatureCounts.set(item.signature, (signatureCounts.get(item.signature) || 0) + 1);
  const duplicateProfiles = signatures.filter((item) => item.signature !== "missing" && (signatureCounts.get(item.signature) || 0) > 1);
  const missingProfiles = signatures.filter((item) => item.signature === "missing");
  const visualFamiliesHealthy = duplicateProfiles.length === 0 && missingProfiles.length === 0 && WEBSITE_DESIGN_DIRECTIONS.length >= 40;

  const metrics = [
    ["Published websites", rows.length, `${healthy} fully healthy`],
    ["Needs attention", attention, "Non-blocking production issue"],
    ["Blocked", blocked, "Critical production issue"],
    ["TheOutHaven subdomains", subdomains, "Managed HTTPS path"],
    ["Custom domains", customDomains, "Owned or OpenSRS registered"],
    ["Design families", WEBSITE_DESIGN_DIRECTIONS.length, visualFamiliesHealthy ? "All composition fingerprints unique" : "Review design coverage"],
  ];

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[.26em] text-rose-300">Website Operations</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div><h1 className="text-3xl font-black sm:text-4xl">Production Verification</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">Verify publishing, hosting replicas, addresses, domain readiness, OpenSRS lifecycle state, and premium design coverage.</p></div>
            <div className="flex gap-2"><a href="/admin/dashboard/website-hosting" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-black">Hosting Overview</a><a href="/admin/dashboard/website-hosting/verification" className="rounded-xl bg-white px-4 py-2 text-sm font-black text-black">Run verification</a></div>
          </div>
        </header>

        <WebsiteHostingTabs active="verification" />

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map(([label,value,helper]) => <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-white/40">{label}</p><p className="mt-2 text-3xl font-black">{value}</p><p className="mt-1 text-xs text-white/45">{helper}</p></article>)}
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-rose-200">Domain registration</p><h2 className="mt-1 text-2xl font-black">OpenSRS first-year domain readiness</h2><p className="mt-1 max-w-3xl text-sm text-white/50">Non-destructive gateway verification for authentication, registration, DNS changes, and renewal capability.</p></div><span className={`rounded-full border px-3 py-1 text-xs font-black ${registrarHealthy ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "border-rose-400/25 bg-rose-400/10 text-rose-100"}`}>{registrarHealthy ? "Registrar ready" : "Registrar attention"}</span></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <GatewayCheck label="Gateway authentication" ok={Boolean(gatewayStatus.ok && gatewayStatus.authenticated)} />
            <GatewayCheck label="Registration" ok={Boolean(gatewayStatus.registrationEnabled)} />
            <GatewayCheck label="DNS automation" ok={Boolean(gatewayStatus.dnsChangesEnabled)} />
            <GatewayCheck label="Renewal" ok={Boolean(gatewayStatus.renewalEnabled)} warningOnly />
          </div>
          {"error" in gatewayStatus && gatewayStatus.error ? <p className="mt-3 text-xs text-rose-200">{String(gatewayStatus.error).replace(/_/g, " ")}</p> : null}
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-rose-200">Live production</p><h2 className="mt-1 text-2xl font-black">Hosted website verification</h2><p className="mt-1 max-w-3xl text-sm text-white/50">Critical publish, address, primary-node, DNS, SSL, and OpenSRS connection checks determine blocked status.</p></div><span className={`rounded-full border px-3 py-1 text-xs font-black ${stateClass(blocked ? "blocked" : attention ? "attention" : "healthy")}`}>{blocked ? `${blocked} blocked` : attention ? `${attention} attention` : "All healthy"}</span></div>
          <div className="space-y-4">
            {rows.map((row) => <article key={row.websiteId} className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{row.locationName}</p><p className="mt-1 text-xs text-white/45">{row.liveAddress || "No address"}{row.publishedVersion ? ` · Version ${row.publishedVersion}` : ""}</p></div><div className="flex items-center gap-2"><span className="text-xs font-black text-white/45">{row.score}%</span><span className={`rounded-full border px-2.5 py-1 text-xs font-black ${stateClass(row.state)}`}>{row.state}</span></div></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{row.checks.map((item) => <div key={item.key} className={`rounded-xl border px-3 py-3 ${item.ok ? "border-emerald-300/15 bg-emerald-500/5" : item.severity === "critical" ? "border-rose-300/20 bg-rose-500/10" : "border-amber-300/20 bg-amber-500/10"}`}><div className="flex items-center justify-between gap-2"><p className="text-xs font-black">{item.label}</p><span className={`text-[10px] font-black uppercase ${item.ok ? "text-emerald-200" : item.severity === "critical" ? "text-rose-200" : "text-amber-200"}`}>{item.ok ? "Pass" : item.severity}</span></div><p className="mt-1 text-xs text-white/45">{item.detail}</p></div>)}</div>
            </article>)}
            {!rows.length ? <p className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/45">No published hosted websites were found.</p> : null}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-rose-200">Premium design QA</p><h2 className="mt-1 text-2xl font-black">40-family design coverage</h2><p className="mt-1 max-w-3xl text-sm text-white/50">Flags missing composition profiles and exact structural duplicates before owner-facing release.</p></div><span className={`rounded-full border px-3 py-1 text-xs font-black ${visualFamiliesHealthy ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "border-rose-400/25 bg-rose-400/10 text-rose-100"}`}>{visualFamiliesHealthy ? "Catalog structurally distinct" : "Catalog needs review"}</span></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{signatures.map(({ direction, signature }) => {
            const profile = WEBSITE_COMPOSITION_PROFILES[direction.id];
            const duplicate = signature !== "missing" && (signatureCounts.get(signature) || 0) > 1;
            return <article key={direction.id} className={`rounded-2xl border p-4 ${!profile || duplicate ? "border-rose-300/20 bg-rose-500/10" : "border-white/10 bg-black/20"}`}><div className="flex items-start justify-between gap-2"><div><p className="font-black">{direction.name}</p><p className="mt-1 text-[11px] text-white/35">{direction.id}</p></div><span className={`text-[10px] font-black uppercase ${!profile || duplicate ? "text-rose-200" : "text-emerald-200"}`}>{!profile ? "Missing" : duplicate ? "Duplicate" : "Distinct"}</span></div>{profile ? <div className="mt-3 grid grid-cols-2 gap-1 text-xs text-white/50"><span>Hero: {profile.hero}</span><span>Nav: {profile.nav}</span><span>Images: {profile.imageRatio}</span><span>Radius: {profile.radius}</span><span>Booking: {profile.reservationPlacement}</span><span>Rule: {profile.sectionRule}</span></div> : null}</article>;
          })}</div>
        </section>
      </div>
    </main>
  );
}
