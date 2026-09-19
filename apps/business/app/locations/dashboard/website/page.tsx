import Link from "next/link";
import { redirect } from "next/navigation";
import { WebsiteBuilderWorkspace } from "@/components/websites/WebsiteBuilderWorkspace";
import { WebsiteDomainSelector } from "@/components/websites/WebsiteDomainSelector";
import { WebsiteEngineSelector } from "@/components/websites/WebsiteEngineSelector";
import { WebsiteV3Preview } from "@/components/websites/WebsiteV3Preview";
import { WebsiteImportPanel } from "@/components/websites/WebsiteImportPanel";
import { WebsiteMigrationReviewPanel } from "@/components/websites/WebsiteMigrationReviewPanel";
import { WebsiteHealthPanel } from "@/components/websites/WebsiteHealthPanel";
import { WebsiteCutoverReadinessPanel } from "@/components/websites/WebsiteCutoverReadinessPanel";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { parseDemoOwnerParams, requireDemoOwnerLocation, type DemoSearchParams } from "@/lib/demo/owner-context";
import { ensureBusinessWebsite } from "@/lib/websites/data";
import { getWebsiteLiveUrl } from "@/lib/websites/platform-domain";
import { getGeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import { WEBSITE_V3_CONCEPTS, normalizeWebsiteRendererVersion, normalizeWebsiteV3Concept } from "@/lib/websites/v3/catalog";
import { normalizeWebsiteV3Palette } from "@/lib/websites/v3/palettes";
import { recommendWebsiteV3Concept } from "@/lib/websites/v3/recommendation";
import { renderWebsiteV3Preview } from "@/lib/websites/v3/render";

export const dynamic = "force-dynamic";

function dashboardHref(params: DemoSearchParams, locationId: string, type: string) {
  const query = new URLSearchParams();
  query.set("locationId", locationId);
  query.set("type", type);
  for (const key of ["adminLocationId", "demo", "fromDemoCenter", "fromCreate"] as const) {
    const value = params[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first) query.set(key, first);
  }
  return `/locations/dashboard?${query.toString()}`;
}

export default async function WebsitePage({ searchParams }: { searchParams?: Promise<DemoSearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const parsed = parseDemoOwnerParams(params);
  const demoContext = parsed.demo ? await requireDemoOwnerLocation(params) : null;
  const location = demoContext?.location || await getCurrentBusinessLocation();
  if (!location) redirect("/locations/dashboard");

  const locationName = getLocationName(location, "Your business");
  const [website, liveContent] = await Promise.all([
    ensureBusinessWebsite(location.id, locationName),
    getGeneratedWebsiteLocationSnapshot(location as unknown as Record<string, unknown>),
  ]);
  const hydratedWebsite = website ? { ...website, live_url: getWebsiteLiveUrl(website) } : null;
  const locationRecord = location as unknown as Record<string, any>;
  const type = String(locationRecord.location_type || parsed.type || "restaurant").toLowerCase().includes("activ") ? "activity" : "restaurant";
  const backHref = dashboardHref(params, location.id, type);
  const editHref = `/locations/${type === "activity" ? "activities" : "restaurants"}/${encodeURIComponent(location.id)}/edit?from=${encodeURIComponent("/locations/dashboard/website")}`;

  const contentSources = [
    { label: "Hours", value: liveContent.hours ? "Connected" : "Add in Edit Location" },
    { label: "Photos", value: liveContent.photos.length ? `${liveContent.photos.length} connected` : "Add in Edit Location" },
    { label: "Menu", value: liveContent.menu ? `${liveContent.menu.items.length} items` : "Publish menu to connect" },
    { label: "Events", value: liveContent.events.length ? `${liveContent.events.length} published` : "Publish events to connect" },
    { label: "Experiences", value: liveContent.experiences.length ? `${liveContent.experiences.length} published` : "Publish experiences to connect" },
    { label: "Reservations", value: liveContent.uses_internal_reservations ? "TheOutHaven Reserve" : liveContent.reservation_provider || (liveContent.reservation_link ? "External provider" : "Set in Edit Location") },
  ];

  const builderLocationContent = {
    address: liveContent.address || null,
    phone: liveContent.phone || null,
    hours: liveContent.hours || null,
    photoCount: liveContent.photos.length,
    menuItemCount: liveContent.menu?.items.length || 0,
    reviewCount: liveContent.reviews.length,
    eventCount: liveContent.events.length,
    experienceCount: liveContent.experiences.length,
    reservationProvider: liveContent.uses_internal_reservations ? "TheOutHaven Reserve" : liveContent.reservation_provider || null,
    hasReservations: Boolean(liveContent.uses_internal_reservations || liveContent.reservation_link),
  };

  const rendererVersion = normalizeWebsiteRendererVersion(hydratedWebsite?.theme?.renderer_version);
  const recommendedConcept = recommendWebsiteV3Concept(liveContent, locationRecord);
  const savedConcept = hydratedWebsite?.theme?.v3_concept ? normalizeWebsiteV3Concept(hydratedWebsite.theme.v3_concept) : null;
  const v3ConceptId = savedConcept || recommendedConcept;
  const v3Palette = normalizeWebsiteV3Palette(hydratedWebsite?.theme?.v3_palette);
  const v3Concept = WEBSITE_V3_CONCEPTS.find((concept) => concept.id === v3ConceptId) || WEBSITE_V3_CONCEPTS[0];
  const v3PreviewHtml = rendererVersion === "v3" && hydratedWebsite
    ? renderWebsiteV3Preview(v3ConceptId, hydratedWebsite, liveContent, v3Palette)
    : null;

  return (
    <main className="min-h-screen bg-[#050607] text-white">
      <style>{`
        .website-builder-brand [class~="text-[#f5b700]"]{color:#ff2142!important}
        .website-builder-brand [class~="bg-[#f5b700]"]{background:#ff2142!important;color:#fff!important}
        .website-builder-brand [class~="bg-[#f5b700]/8"]{background:rgba(255,33,66,.08)!important}
        .website-builder-brand [class~="border-[#f5b700]/25"]{border-color:rgba(255,33,66,.28)!important}
      `}</style>
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff2142]">Location Dashboard</p><h1 className="mt-1 text-3xl font-black">Website</h1><p className="mt-2 text-sm text-white/55">Design, move, publish, and monitor {locationName}&apos;s website from one place.</p></div>
          <div className="flex flex-wrap gap-2"><Link href={editHref} className="rounded-full border border-[#ff2142]/30 bg-[#ff2142]/10 px-5 py-3 text-sm font-black text-rose-100">Edit business information</Link><Link href={backHref} className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-black hover:bg-white/[0.09]">Back to location dashboard</Link></div>
        </div>
        {demoContext?.demoMode ? <div className="mb-5 rounded-2xl border border-[#ff2142]/25 bg-[#ff2142]/10 px-4 py-3 text-sm font-bold text-rose-100">Internal demo mode — publishing is allowed only for the protected TheOutHaven Lounge demo location.</div> : null}
        {hydratedWebsite ? (
          <div className="website-builder-brand">
            <WebsiteDomainSelector initialWebsite={hydratedWebsite} locationName={locationName} includedDomainName={locationRecord.included_domain_name || null} includedDomainStatus={locationRecord.included_domain_status || null} includedDomainConnectionStatus={locationRecord.included_domain_connection_status || null} includedDomainRenewalDueAt={locationRecord.included_domain_renewal_due_at || null} />
            <section className="mb-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff2142]">Business information</p><h2 className="mt-2 text-xl font-black">Your website stays current automatically</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Edit business facts once in Edit Location. Hours, photos, menu items, published events, experiences, contact details, and reservation settings feed the website automatically. This Website area is for design, migration, address, preview, publishing, and health.</p></div><span className="rounded-full border border-white/10 bg-black/30 px-3 py-2 text-xs font-black text-white/60">Auto-sync on</span></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{contentSources.map(source=><div key={source.label} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/40">{source.label}</p><p className="mt-2 text-sm font-black text-white">{source.value}</p></div>)}</div>
            </section>

            <WebsiteEngineSelector locationId={location.id} initialRenderer={rendererVersion} initialConcept={v3ConceptId} initialPalette={v3Palette} recommendedConcept={recommendedConcept} />

            {rendererVersion === "v3" ? (
              <div className="space-y-5">
                <section className="rounded-3xl border border-emerald-300/15 bg-emerald-400/[0.05] p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">V3 Premium workspace</p><h2 className="mt-2 text-2xl font-black">{v3Concept.name}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">{v3Concept.description} TheOutHaven recommended {WEBSITE_V3_CONCEPTS.find(x=>x.id===recommendedConcept)?.name || "this direction"} from the location&apos;s current business signals.</p><p className="mt-3 text-xs leading-5 text-white/40">Best for: {v3Concept.bestFor}</p></div><span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-black text-emerald-100">Preview ready</span></div>
                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/55">Your current Legacy website has not been deleted or overwritten. V3 publishing stays locked during visual QA, so you can review the new design safely and switch back to Legacy at any time.</div>
                </section>
                {v3PreviewHtml ? <WebsiteV3Preview html={v3PreviewHtml} conceptName={v3Concept.name} /> : null}
              </div>
            ) : (
              <><WebsiteImportPanel locationId={location.id} /><WebsiteMigrationReviewPanel locationId={location.id} /><WebsiteBuilderWorkspace initialWebsite={hydratedWebsite} locationName={locationName} locationContent={builderLocationContent} /><div className="mt-5 grid gap-5 xl:grid-cols-2"><WebsiteCutoverReadinessPanel locationId={location.id} hasCustomDomain={Boolean(hydratedWebsite.domain)} /><WebsiteHealthPanel locationId={location.id} /></div></>
            )}
          </div>
        ) : <section className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-sm font-bold text-red-100">Website setup is temporarily unavailable.</section>}
      </div>
    </main>
  );
}
