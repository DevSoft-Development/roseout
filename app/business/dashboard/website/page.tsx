import { GrowthProShell } from "@/components/growth-pro/GrowthProShell";
import { DesignDirectionPicker } from "@/components/websites/DesignDirectionPicker";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { ensureLocationWebsite, getWebsiteLiveSyncFields } from "@/lib/websites/data";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function Page() {
  const location = await getCurrentBusinessLocation();
  if (!location) return <GrowthProShell title="AI Website Builder"><div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">No claimed location found.</div></GrowthProShell>;

  const website = await ensureLocationWebsite(location.id, getLocationName(location, "Your business"));
  const fields = getWebsiteLiveSyncFields();
  const versions = website ? (await supabaseAdmin.from("location_website_versions").select("id,version,source,created_at,published_at").eq("website_id", website.id).order("version", { ascending: false }).limit(8)).data || [] : [];
  const publishLabel = String(website?.last_publish_status || "not_published").replaceAll("_", " ");

  return <GrowthProShell title="AI Website Builder"><div className="space-y-5">
    <section className="rounded-3xl border border-rose-200/15 bg-white/[0.04] p-6"><p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">{getLocationName(location, "Your location")}</p><h2 className="mt-2 text-2xl font-black">Describe the vision. We match the direction.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">The owner describes how the website should feel. TheOutHaven matches that vision to an approved design direction, then the confirmed direction becomes the foundation for AI copy and layout personalization.</p></section>
    <DesignDirectionPicker locationId={location.id} />
    <div className="grid gap-4 md:grid-cols-4"><article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Website</p><p className="mt-3 text-2xl font-black capitalize">{website?.status || "Setup pending"}</p></article><article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Publish</p><p className="mt-3 text-2xl font-black capitalize">{publishLabel}</p></article><article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Hosting</p><p className="mt-3 text-2xl font-black">Lightsail</p></article><article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Sections</p><p className="mt-3 text-2xl font-black">{website?.sections?.filter((item) => item.enabled).length ?? 0}</p></article></div>
    <section className="rounded-3xl border border-white/10 bg-black/25 p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-lg font-black">Version history</h3><p className="mt-1 text-sm text-white/55">Latest saved website states. Rollback is handled through the protected version API.</p></div>{website?.published_version ? <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">Published version {website.published_version}</p> : null}</div><div className="mt-4 space-y-2">{versions.length ? versions.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3"><div><p className="font-black">Version {item.version}</p><p className="mt-1 text-xs text-white/45">{String(item.source).replaceAll("_", " ")} · {new Date(item.created_at).toLocaleString()}</p></div>{website?.published_version === item.version ? <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200">Published</span> : null}</div>) : <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-white/45">No website versions yet.</div>}</div></section>
    <section className="rounded-3xl border border-white/10 bg-black/25 p-5"><h3 className="text-lg font-black">Automatically synced from the location dashboard</h3><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{fields.map((field) => <div key={field} className="rounded-2xl border border-emerald-300/15 bg-emerald-500/5 px-4 py-3 text-sm font-bold text-emerald-100">{field}</div>)}</div></section>
    <section className="rounded-3xl border border-white/10 bg-black/25 p-5"><h3 className="text-lg font-black">Guardrails</h3><p className="mt-2 text-sm leading-6 text-white/60">No AI images. Real business photos stay live-bound. Matching the design direction is separate from full AI website generation, so owners can refine the direction before generation cost is spent.</p></section>
  </div></GrowthProShell>;
}
