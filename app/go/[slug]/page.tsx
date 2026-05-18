import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  campaignCaption,
  campaignImage,
  campaignPlace,
  campaignTitle,
  loadCampaignBySlug,
  loadFeaturedLocations,
  locationCategory,
  locationHref,
  locationImage,
  locationName,
  trackCampaignClick,
} from "@/lib/marketing-public";
import { resolveCampaignLocation } from "@/lib/locations/resolve-location";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ utm_source?: string }>;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await loadCampaignBySlug(slug);
  if (!campaign) return { title: "Campaign | TheOutHaven" };
  return {
    title: `${campaignTitle(campaign)} | TheOutHaven`,
    description: campaign.location_description || campaignCaption(campaign),
    openGraph: {
      title: campaignTitle(campaign),
      description: campaign.location_description || campaignCaption(campaign),
      images: [campaignImage(campaign)],
    },
  };
}

function buildExactPlanHref(slug: string, locationId?: string | null, sourceTable?: string | null) {
  const params = new URLSearchParams({ campaignSlug: slug, planExact: "true" });
  if (locationId) params.set("locationId", locationId);
  if (sourceTable) params.set("sourceTable", sourceTable);
  return `/create?${params.toString()}`;
}

export default async function CampaignLandingPage({ params, searchParams }: PageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const campaign = await loadCampaignBySlug(slug);
  if (!campaign) notFound();

  await trackCampaignClick(campaign, slug, query.utm_source);
  const [nearby, resolvedLocation] = await Promise.all([
    loadFeaturedLocations(6, campaign.location_city, campaign.location_state),
    resolveCampaignLocation(campaign),
  ]);
  const place = campaignPlace(campaign);
  const locationId = resolvedLocation?.sourceId || campaign.location_source_id || resolvedLocation?.id || null;
  const sourceTable = resolvedLocation?.sourceTable || campaign.location_source_type || null;
  const publicLocationUrl =
    resolvedLocation?.publicUrl ||
    campaign.public_location_url ||
    (locationId ? `/locations/${resolvedLocation?.type === "activity" || sourceTable === "activities" ? "activities" : "restaurants"}/${locationId}` : "");
  const planHref = buildExactPlanHref(slug, locationId, sourceTable);
  const imageUrl = campaign.location_image_url?.trim();
  const imageAlt = campaign.location_name || campaignTitle(campaign);

  return (
    <main className="min-h-screen bg-[#fff8f3] text-[#1b1210]">
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-24 lg:pt-32">
        <Link href="/go" className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-black text-black/60 shadow-sm transition hover:border-rose-200 hover:text-rose-700">← Back to campaigns</Link>

        <article className="mt-5 grid gap-8 lg:grid-cols-[1fr_0.95fr] lg:items-start">
          <div className="relative overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.28),transparent_34%),linear-gradient(135deg,#1b1210,#050505_70%,#3a1715)] shadow-2xl">
            <div className="relative aspect-[4/3] w-full lg:aspect-[16/10]">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={imageAlt}
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-white">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-200">TheOutHaven pick</p>
                    <p className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">{campaignTitle(campaign)}</p>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              <div className="absolute left-5 right-5 top-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#1b1210]">{campaign.caption_category || resolvedLocation?.primaryCategory || campaign.location_category || "Social campaign"}</span>
                {campaign.source_platform && <span className="rounded-full bg-[#1b1210] px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white">{campaign.source_platform}</span>}
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.12),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.94),#fff8f3)] p-5 shadow-xl sm:p-8 lg:p-10">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-700">TheOutHaven pick</p>
              <h1 className="mt-3 text-4xl font-black leading-[0.95] tracking-[-0.055em] sm:text-5xl lg:text-6xl">{campaignTitle(campaign)}</h1>
              <p className="mt-3 text-base font-bold text-black/50">{[resolvedLocation?.name || campaign.location_name, place].filter(Boolean).join(" • ") || "Plan-ready social find"}</p>
            </div>

            <div className="mt-2 rounded-[1.5rem] border border-black/10 bg-white p-5 shadow-sm lg:mt-8">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-700">Selected location</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">{resolvedLocation?.name || campaign.location_name || "Featured TheOutHaven plan"}</h2>
              <p className="mt-2 text-sm font-bold text-black/45">{[resolvedLocation?.primaryCategory || campaign.location_category || campaign.caption_category, [resolvedLocation?.city || campaign.location_city, resolvedLocation?.state || campaign.location_state].filter(Boolean).join(", ") || place].filter(Boolean).join(" • ")}</p>
              <p className="mt-5 text-base font-semibold leading-7 text-black/65">{resolvedLocation?.description || campaign.location_description || campaignCaption(campaign) || "This is the campaign landing page for the post you saw. Use the actions below to plan it, view the location, or find something nearby."}</p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Link href={planHref} className="rounded-full bg-gradient-to-r from-rose-500 via-red-600 to-rose-700 px-5 py-4 text-center text-sm font-black text-white shadow-lg shadow-rose-950/20">Plan this outing</Link>
              {publicLocationUrl ? <Link href={publicLocationUrl} className="rounded-full bg-[#1b1210] px-5 py-4 text-center text-sm font-black text-white">View location</Link> : <Link href="/create" className="rounded-full bg-[#1b1210] px-5 py-4 text-center text-sm font-black text-white">View location</Link>}
              <Link href={`/reserve?location=${encodeURIComponent(locationId || campaign.location_name || "")}`} className="rounded-full border border-[#1b1210] bg-white px-5 py-4 text-center text-sm font-black text-[#1b1210] sm:border-black/10">Reserve if available</Link>
              <Link href={`/create?campaignSlug=${encodeURIComponent(slug)}&planExact=true&nearby=true${locationId ? `&locationId=${encodeURIComponent(locationId)}` : ""}${sourceTable ? `&sourceTable=${encodeURIComponent(sourceTable)}` : ""}`} className="rounded-full border border-[#1b1210] bg-white px-5 py-4 text-center text-sm font-black text-[#1b1210] sm:border-black/10">Find nearby spots</Link>
            </div>

            {campaign.hashtags?.length ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {campaign.hashtags.slice(0, 8).map((tag) => <span key={tag} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">{tag}</span>)}
              </div>
            ) : null}
          </div>
        </article>

        <section className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-700">Nearby ideas</p>
              <h2 className="mt-1 text-3xl font-black tracking-[-0.04em]">Restaurants/activities nearby</h2>
            </div>
            <Link href="/go" className="w-fit rounded-full bg-[#1b1210] px-4 py-2 text-xs font-black text-white">Search more</Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nearby.map((location) => (
              <Link key={location.id} href={locationHref(location)} className="grid grid-cols-[96px_1fr] gap-3 rounded-[1.5rem] border border-black/10 bg-white p-3 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                <img src={locationImage(location)} alt={locationName(location)} className="h-24 w-24 rounded-[1.1rem] object-cover" />
                <div className="min-w-0 py-1">
                  <p className="truncate text-base font-black">{locationName(location)}</p>
                  <p className="mt-1 text-xs font-black uppercase tracking-wide text-rose-700">{locationCategory(location)}</p>
                  <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-black/45">{[location.city, location.state].filter(Boolean).join(", ") || location.description || "Nearby TheOutHaven pick"}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
