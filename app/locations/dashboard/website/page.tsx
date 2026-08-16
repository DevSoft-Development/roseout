import Link from "next/link";
import { redirect } from "next/navigation";
import { WebsiteBuilderWorkspace } from "@/components/websites/WebsiteBuilderWorkspace";
import { WebsiteDomainSelector } from "@/components/websites/WebsiteDomainSelector";
import { WebsiteLogoManager } from "@/components/websites/WebsiteLogoManager";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { parseDemoOwnerParams, requireDemoOwnerLocation, type DemoSearchParams } from "@/lib/demo/owner-context";
import { ensureBusinessWebsite } from "@/lib/websites/data";
import { getWebsiteLiveUrl } from "@/lib/websites/platform-domain";
import { getGeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";

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
  const hydratedWebsite = website ? {
    ...website,
    live_url: getWebsiteLiveUrl(website),
  } : null;
  const type = String((location as any).location_type || parsed.type || "restaurant").toLowerCase().includes("activ") ? "activity" : "restaurant";
  const backHref = dashboardHref(params, location.id, type);

  const contentSources = [
    { label: "Hours", value: liveContent.hours ? "Connected" : "Add in dashboard" },
    { label: "Photos", value: liveContent.photos.length ? `${liveContent.photos.length} connected` : "Add in dashboard" },
    { label: "Menu", value: liveContent.menu ? `${liveContent.menu.items.length} items` : "Publish menu to connect" },
    { label: "Reviews", value: liveContent.reviews.length ? `${liveContent.reviews.length} approved` : "No approved reviews yet" },
  ];

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
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff2142]">Location Dashboard</p>
            <h1 className="mt-1 text-3xl font-black">Website Builder</h1>
            <p className="mt-2 text-sm text-white/55">{locationName}</p>
          </div>
          <Link href={backHref} className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-black hover:bg-white/[0.09]">Back to location dashboard</Link>
        </div>

        {demoContext?.demoMode ? (
          <div className="mb-5 rounded-2xl border border-[#ff2142]/25 bg-[#ff2142]/10 px-4 py-3 text-sm font-bold text-rose-100">
            Internal demo mode — publishing is allowed only for the protected TheOutHaven Lounge demo location.
          </div>
        ) : null}

        {hydratedWebsite ? (
          <div className="website-builder-brand">
            <WebsiteDomainSelector initialWebsite={hydratedWebsite} locationName={locationName} />
            <WebsiteLogoManager initialWebsite={hydratedWebsite} locationName={locationName} />

            <section className="mb-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff2142]">Live website content</p>
                  <h2 className="mt-2 text-xl font-black">Connected from this location dashboard</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">AI writes the presentation and section copy. Hours, photos, menu items, reviews, contact details, reservations, and your uploaded logo stay grounded in real dashboard data and are never invented.</p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-2 text-xs font-black text-white/60">Auto-sync</span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {contentSources.map((source) => (
                  <div key={source.label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/40">{source.label}</p>
                    <p className="mt-2 text-sm font-black text-white">{source.value}</p>
                  </div>
                ))}
              </div>
            </section>

            <WebsiteBuilderWorkspace initialWebsite={hydratedWebsite} locationName={locationName} />
          </div>
        ) : (
          <section className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-sm font-bold text-red-100">Website builder setup is temporarily unavailable.</section>
        )}
      </div>
    </main>
  );
}
