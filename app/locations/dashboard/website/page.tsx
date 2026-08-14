import Link from "next/link";
import { redirect } from "next/navigation";
import { DesignDirectionPicker } from "@/components/websites/DesignDirectionPicker";
import { WebsiteBuilderWorkspace } from "@/components/websites/WebsiteBuilderWorkspace";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { parseDemoOwnerParams, requireDemoOwnerLocation, type DemoSearchParams } from "@/lib/demo/owner-context";
import { ensureBusinessWebsite, getWebsiteLiveSyncFields } from "@/lib/websites/data";
import { getPlatformWebsiteDomain, getWebsiteLiveUrl } from "@/lib/websites/platform-domain";

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
  const website = await ensureBusinessWebsite(location.id, locationName);
  const hydratedWebsite = website ? {
    ...website,
    platform_domain: getPlatformWebsiteDomain(website.id, locationName),
    live_url: getWebsiteLiveUrl(website, locationName),
  } : null;
  const fields = getWebsiteLiveSyncFields();
  const type = String((location as any).location_type || parsed.type || "restaurant").toLowerCase().includes("activ") ? "activity" : "restaurant";
  const backHref = dashboardHref(params, location.id, type);

  return (
    <main className="min-h-screen bg-[#050607] text-white">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff2142]">Location Dashboard</p>
            <h1 className="mt-1 text-3xl font-black">AI Website Builder</h1>
            <p className="mt-2 text-sm text-white/55">{locationName}</p>
          </div>
          <Link href={backHref} className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-black hover:bg-white/[0.09]">Back to location dashboard</Link>
        </div>

        {demoContext?.demoMode ? (
          <div className="mb-5 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-100">
            Internal demo mode — publishing is allowed only for the protected TheOutHaven Lounge demo location.
          </div>
        ) : null}

        <div className="space-y-5">
          <section className="rounded-3xl border border-rose-200/15 bg-white/[0.04] p-6">
            <h2 className="text-2xl font-black">Build, preview, and publish from the same location workspace.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">Choose a design direction, edit sections, preview the draft, and publish directly to the assigned TheOutHaven Lightsail web node. Every published website receives a location-name-based TheOutHaven subdomain until its custom domain is connected.</p>
          </section>

          <DesignDirectionPicker locationId={location.id} />
          {hydratedWebsite ? (
            <WebsiteBuilderWorkspace initialWebsite={hydratedWebsite} locationName={locationName} />
          ) : (
            <section className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-sm font-bold text-red-100">Website builder setup is temporarily unavailable.</section>
          )}

          <section className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <h3 className="text-lg font-black">Automatically synced from this location</h3>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {fields.map((field) => <div key={field} className="rounded-2xl border border-emerald-300/15 bg-emerald-500/5 px-4 py-3 text-sm font-bold text-emerald-100">{field}</div>)}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
