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
import { getDomainGatewayStatus } from "@/lib/domains/gateway";
import { WEBSITE_COMPOSITION_PROFILES } from "@/lib/websites/composition-profiles";
import { WEBSITE_DESIGN_DIRECTIONS } from "@/lib/websites/design-directions";
import { loadWebsiteProductionVerification } from "@/lib/websites/production-verification";

export const metadata: Metadata = {
  title: "Website Verification | Admin",
  description: "Verify hosted website production state, domain paths, replicas, registrar readiness, and premium design coverage.",
};

export const dynamic = "force-dynamic";

function tone(state: "healthy" | "attention" | "blocked") {
  return state === "healthy" ? "green" as const : state === "blocked" ? "rose" as const : "amber" as const;
}

function profileSignature(id: string) {
  const profile = WEBSITE_COMPOSITION_PROFILES[id];
  if (!profile) return "missing";
  return [
    profile.nav,
    profile.hero,
    profile.sectionOrder.join(">"),
    profile.reservationPlacement,
    profile.radius,
    profile.maxWidth,
    profile.displayScale,
    profile.eyebrowTracking,
    profile.imageRatio,
    profile.sectionRule,
  ].join("|");
}

export default async function WebsiteVerificationPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);

  const [rows, gatewayStatus] = await Promise.all([
    loadWebsiteProductionVerification(),
    getDomainGatewayStatus().catch((error) => ({
      ok: false,
      authenticated: false,
      registrationEnabled: false,
      renewalEnabled: false,
      dnsChangesEnabled: false,
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

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Website Operations"
        title="Production Verification"
        subtitle="One place to verify publishing, primary and standby hosting, website addresses, custom-domain readiness, OpenSRS lifecycle state, and premium design-system coverage."
        actions={<><AdminActionButton href="/admin/dashboard/website-hosting">Hosting Overview</AdminActionButton><AdminActionButton href="/admin/dashboard/website-hosting/verification" variant="primary">Run verification</AdminActionButton></>}
      />

      <WebsiteHostingTabs active="verification" />

      <AdminKpiGrid>
        <AdminKpiCard label="Published websites" value={rows.length} helper={`${healthy} fully healthy`} />
        <AdminKpiCard label="Needs attention" value={attention} helper="Non-blocking production issue" />
        <AdminKpiCard label="Blocked" value={blocked} helper="Critical production issue" />
        <AdminKpiCard label="TheOutHaven subdomains" value={subdomains} helper="Managed HTTPS path" />
        <AdminKpiCard label="Custom domains" value={customDomains} helper="Owned or OpenSRS registered" />
        <AdminKpiCard label="Design families" value={WEBSITE_DESIGN_DIRECTIONS.length} helper={visualFamiliesHealthy ? "All composition fingerprints unique" : "Review design coverage"} />
      </AdminKpiGrid>

      <AdminSectionCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Domain registration</p><h2 className="mt-1 text-2xl font-black">OpenSRS first-year domain readiness</h2><p className="mt-1 max-w-3xl text-sm text-white/50">This is a non-destructive live gateway check. It verifies authentication, registration, DNS changes, and renewal capability without buying a domain.</p></div>
          <AdminStatusBadge tone={registrarHealthy ? "green" : "rose"}>{registrarHealthy ? "Registrar ready" : "Registrar attention"}</AdminStatusBadge>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <GatewayCheck label="Gateway authentication" ok={Boolean(gatewayStatus.ok && gatewayStatus.authenticated)} />
          <GatewayCheck label="Registration" ok={Boolean(gatewayStatus.registrationEnabled)} />
          <GatewayCheck label="DNS automation" ok={Boolean(gatewayStatus.dnsChangesEnabled)} />
          <GatewayCheck label="Renewal" ok={Boolean(gatewayStatus.renewalEnabled)} warningOnly />
        </div>
        {"error" in gatewayStatus && gatewayStatus.error ? <p className="mt-3 text-xs text-rose-200">{String(gatewayStatus.error).replace(/_/g, " ")}</p> : null}
      </AdminSectionCard>

      <AdminSectionCard className="p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Live production</p><h2 className="mt-1 text-2xl font-black">Hosted website verification</h2><p className="mt-1 max-w-3xl text-sm text-white/50">A website is blocked only when a critical publish, address, primary-node, DNS, SSL, or OpenSRS connection check fails. Standby and health freshness are tracked separately.</p></div>
          <AdminStatusBadge tone={blocked ? "rose" : attention ? "amber" : "green"}>{blocked ? `${blocked} blocked` : attention ? `${attention} attention` : "All healthy"}</AdminStatusBadge>
        </div>

        <div className="space-y-4">
          {rows.map((row) => <article key={row.websiteId} className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-black text-white">{row.locationName}</p><p className="mt-1 text-xs text-white/45">{row.liveAddress || "No address"}{row.publishedVersion ? ` · Version ${row.publishedVersion}` : ""}</p></div>
              <div className="flex items-center gap-2"><span className="text-xs font-black text-white/45">{row.score}%</span><AdminStatusBadge tone={tone(row.state)}>{row.state === "healthy" ? "Healthy" : row.state === "blocked" ? "Blocked" : "Attention"}</AdminStatusBadge></div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{row.checks.map((item) => <div key={item.key} className={`rounded-xl border px-3 py-3 ${item.ok ? "border-emerald-300/15 bg-emerald-500/5" : item.severity === "critical" ? "border-rose-300/20 bg-rose-500/10" : "border-amber-300/20 bg-amber-500/10"}`}><div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-white">{item.label}</p><span className={`text-[10px] font-black uppercase tracking-[0.12em] ${item.ok ? "text-emerald-200" : item.severity === "critical" ? "text-rose-200" : "text-amber-200"}`}>{item.ok ? "Pass" : item.severity}</span></div><p className="mt-1 text-xs text-white/45">{item.detail}</p></div>)}</div>
          </article>)}
          {!rows.length ? <p className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/45">No published hosted websites were found.</p> : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard className="p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Premium design QA</p><h2 className="mt-1 text-2xl font-black">40-family design coverage</h2><p className="mt-1 max-w-3xl text-sm text-white/50">This matrix catches missing composition profiles and exact structural duplicates before they reach business owners. Desktop, iPad/tablet, and phone rendering are available in Website Preview for final visual approval.</p></div><AdminStatusBadge tone={visualFamiliesHealthy ? "green" : "rose"}>{visualFamiliesHealthy ? "Catalog structurally distinct" : "Catalog needs review"}</AdminStatusBadge></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{signatures.map(({ direction, signature }) => {
          const profile = WEBSITE_COMPOSITION_PROFILES[direction.id];
          const duplicate = signature !== "missing" && (signatureCounts.get(signature) || 0) > 1;
          return <article key={direction.id} className={`rounded-2xl border p-4 ${!profile || duplicate ? "border-rose-300/20 bg-rose-500/10" : "border-white/10 bg-black/20"}`}><div className="flex items-start justify-between gap-2"><div><p className="font-black text-white">{direction.name}</p><p className="mt-1 text-[11px] text-white/35">{direction.id}</p></div><span className={`text-[10px] font-black uppercase ${!profile || duplicate ? "text-rose-200" : "text-emerald-200"}`}>{!profile ? "Missing" : duplicate ? "Duplicate" : "Distinct"}</span></div>{profile ? <div className="mt-3 grid grid-cols-2 gap-1 text-xs text-white/50"><span>Hero: {profile.hero}</span><span>Nav: {profile.nav}</span><span>Images: {profile.imageRatio}</span><span>Radius: {profile.radius}</span><span>Booking: {profile.reservationPlacement}</span><span>Rule: {profile.sectionRule}</span></div> : null}</article>;
        })}</div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}

function GatewayCheck({ label, ok, warningOnly = false }: { label: string; ok: boolean; warningOnly?: boolean }) {
  return <div className={`rounded-xl border px-4 py-3 ${ok ? "border-emerald-300/15 bg-emerald-500/5" : warningOnly ? "border-amber-300/20 bg-amber-500/10" : "border-rose-300/20 bg-rose-500/10"}`}><div className="flex items-center justify-between gap-2"><p className="text-sm font-black text-white">{label}</p><span className={`text-[10px] font-black uppercase ${ok ? "text-emerald-200" : warningOnly ? "text-amber-200" : "text-rose-200"}`}>{ok ? "Ready" : "Not ready"}</span></div></div>;
}
