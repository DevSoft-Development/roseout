import Link from "next/link";
import { redirect } from "next/navigation";
import { WebsiteBuilderWorkspace } from "@/components/websites/WebsiteBuilderWorkspace";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { parseDemoOwnerParams, requireDemoOwnerLocation, type DemoSearchParams } from "@/lib/demo/owner-context";
import { ensureBusinessWebsite } from "@/lib/websites/data";
import { getWebsiteLiveUrl } from "@/lib/websites/platform-domain";

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
    live_url: getWebsiteLiveUrl(website),
  } : null;
  const type = String((location as any).location_type || parsed.type || "restaurant").toLowerCase().includes("activ") ? "activity" : "restaurant";
  const backHref = dashboardHref(params, location.id, type);

  return (
    <main className="min-h-screen bg-[#050607] text-white">
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
          <div className="mb-5 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-100">
            Internal demo mode — publishing is allowed only for the protected TheOutHaven Lounge demo location.
          </div>
        ) : null}

        {hydratedWebsite ? (
          <WebsiteBuilderWorkspace initialWebsite={hydratedWebsite} locationName={locationName} />
        ) : (
          <section className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-sm font-bold text-red-100">Website builder setup is temporarily unavailable.</section>
        )}
      </div>
    </main>
  );
}
