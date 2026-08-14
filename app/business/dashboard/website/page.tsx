import { GrowthProShell } from "@/components/growth-pro/GrowthProShell";
import { DesignDirectionPicker } from "@/components/websites/DesignDirectionPicker";
import { WebsiteBuilderWorkspace } from "@/components/websites/WebsiteBuilderWorkspace";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { ensureBusinessWebsite, getWebsiteLiveSyncFields } from "@/lib/websites/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const location = await getCurrentBusinessLocation();
  if (!location) return <GrowthProShell title="AI Website Builder"><div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">No claimed location found.</div></GrowthProShell>;

  const website = await ensureBusinessWebsite(location.id, getLocationName(location, "Your business"));
  const fields = getWebsiteLiveSyncFields();

  return <GrowthProShell title="AI Website Builder"><div className="space-y-5">
    <section className="rounded-3xl border border-rose-200/15 bg-white/[0.04] p-6"><p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">{getLocationName(location, "Your location")}</p><h2 className="mt-2 text-2xl font-black">Build and publish your website from one place.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">Choose the design direction, edit the sections, preview the draft, and publish directly to TheOutHaven&apos;s Lightsail hosting. Business details that are marked as live-bound continue syncing from your location profile.</p></section>
    <DesignDirectionPicker locationId={location.id} />
    {website ? <WebsiteBuilderWorkspace initialWebsite={website} locationName={getLocationName(location, "Your business")} /> : <section className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-sm font-bold text-red-100">Website builder setup is temporarily unavailable.</section>}
    <section className="rounded-3xl border border-white/10 bg-black/25 p-5"><h3 className="text-lg font-black">Automatically synced from the location dashboard</h3><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{fields.map((field) => <div key={field} className="rounded-2xl border border-emerald-300/15 bg-emerald-500/5 px-4 py-3 text-sm font-bold text-emerald-100">{field}</div>)}</div></section>
    <section className="rounded-3xl border border-white/10 bg-black/25 p-5"><h3 className="text-lg font-black">Guardrails</h3><p className="mt-2 text-sm leading-6 text-white/60">No AI images. Real business photos stay live-bound. Draft changes never become public until the publish action completes successfully on the assigned Lightsail website node.</p></section>
  </div></GrowthProShell>;
}
