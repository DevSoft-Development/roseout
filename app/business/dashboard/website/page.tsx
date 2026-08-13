import { GrowthProShell } from "@/components/growth-pro/GrowthProShell";
import { DesignDirectionPicker } from "@/components/websites/DesignDirectionPicker";
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
    <section className="rounded-3xl border border-rose-200/15 bg-white/[0.04] p-6"><p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">{getLocationName(location, "Your location")}</p><h2 className="mt-2 text-2xl font-black">Describe the vision. We match the direction.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">The owner describes how the website should feel. TheOutHaven matches that vision to an approved design direction, then the confirmed direction becomes the foundation for AI copy and layout personalization.</p></section>
    <DesignDirectionPicker locationId={location.id} />
    <div className="grid gap-4 md:grid-cols-3"><article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Website</p><p className="mt-3 text-2xl font-black capitalize">{website?.editor_status || "Setup pending"}</p></article><article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Hosting</p><p className="mt-3 text-2xl font-black">Lightsail</p></article><article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Sections</p><p className="mt-3 text-2xl font-black">{website?.sections?.filter((item) => item.enabled).length ?? 0}</p></article></div>
    <section className="rounded-3xl border border-white/10 bg-black/25 p-5"><h3 className="text-lg font-black">Automatically synced from the location dashboard</h3><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{fields.map((field) => <div key={field} className="rounded-2xl border border-emerald-300/15 bg-emerald-500/5 px-4 py-3 text-sm font-bold text-emerald-100">{field}</div>)}</div></section>
    <section className="rounded-3xl border border-white/10 bg-black/25 p-5"><h3 className="text-lg font-black">Guardrails</h3><p className="mt-2 text-sm leading-6 text-white/60">No AI images. Real business photos stay live-bound. Matching the design direction is separate from full AI website generation, so owners can refine the direction before generation cost is spent.</p></section>
  </div></GrowthProShell>;
}
