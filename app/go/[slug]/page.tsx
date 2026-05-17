import type { Metadata } from "next";
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

  return (
    <main className="min-h-screen bg-[#fff8f3] text-[#1b1210]">
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:pt-32">
        <Link href="/go" className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-black text-black/60 shadow-sm transition hover:border-rose-200 hover:text-rose-700">← Back to campaigns</Link>

        <article className="mt-5 grid overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-2xl lg:grid-cols-[0.96fr_1.04fr]">
          <div className="relative min-h-[430px] bg-[#eadfd8] lg:min-h-[680px]">
            <img src={campaignImage(campaign)} alt={campaign.location_name || campaignTitle(campaign)} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent lg:bg-gradient-to-r lg:from-black/20 lg:via-transparent lg:to-black/10" />
            <div className="absolute left-5 right-5 top-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#1b1210]">{campaign.caption_category || resolvedLocation?.primaryCategory || campaign.location_category || "Social campaign"}</span>
              {campaign.source_platform && <span className="rounded-full bg-[#1b1210] px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white">{campaign.source_platform}</span>}
            </div>
            <div className="absolute bottom-5 left-5 right-5 text-white lg:hidden">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">TheOutHaven pick</p>
              <h1 className="mt-2 text-4xl font-black leading-none tracking-[-0.055em]">{campaignTitle(campaign)}</h1>
              <p className="mt-3 text-base font-bold text-white/80">{[resolvedLocation?.name || campaign.location_name, place].filter(Boolean).join(" • ") || "Plan-ready social find"}</p>
            </div>
          </div>

          <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.12),transparent_32%),linear-gradient(180deg,#ffffff,#fff8f3)] p-5 sm:p-8 lg:p-10">
            <div className="hidden lg:block">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-700">TheOutHaven pick</p>
              <h1 className="mt-3 text-6xl font-black leading-[0.92] tracking-[-0.06em]">{campaignTitle(campaign)}</h1>
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
