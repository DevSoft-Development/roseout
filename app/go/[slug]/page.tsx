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

export default async function CampaignLandingPage({ params, searchParams }: PageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const campaign = await loadCampaignBySlug(slug);
  if (!campaign) notFound();

  await trackCampaignClick(campaign, slug, query.utm_source);
  const nearby = await loadFeaturedLocations(6, campaign.location_city, campaign.location_state);
  const place = campaignPlace(campaign);
  const publicLocationUrl = campaign.public_location_url || (campaign.location_source_type && campaign.location_source_id ? `/locations/${campaign.location_source_type === "activities" ? "activities" : "restaurants"}/${campaign.location_source_id}` : "");

  return (
    <main className="min-h-screen bg-[#fff8f3] text-[#1b1210]">
      <section className="mx-auto max-w-3xl px-4 pb-12 pt-5">
        <Link href="/go" className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-black text-black/55 shadow-sm">← Back to link in bio</Link>

        <article className="mt-4 overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-2xl">
          <div className="relative h-[420px] max-h-[62vh] bg-[#eadfd8]">
            <img src={campaignImage(campaign)} alt={campaign.location_name || campaignTitle(campaign)} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
            <div className="absolute left-5 right-5 top-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#1b1210]">{campaign.caption_category || campaign.location_category || "Social campaign"}</span>
              {campaign.source_platform && <span className="rounded-full bg-rose-600 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white">{campaign.source_platform}</span>}
            </div>
            <div className="absolute bottom-5 left-5 right-5 text-white">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">TheOutHaven pick</p>
              <h1 className="mt-2 text-4xl font-black leading-none tracking-tight sm:text-5xl">{campaignTitle(campaign)}</h1>
              <p className="mt-3 text-base font-bold text-white/80">{[campaign.location_name, place].filter(Boolean).join(" • ") || "Plan-ready social find"}</p>
            </div>
          </div>

          <div className="space-y-5 p-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-700">Selected location</p>
              <h2 className="mt-1 text-2xl font-black">{campaign.location_name || "Featured TheOutHaven plan"}</h2>
              <p className="mt-1 text-sm font-bold text-black/45">{[campaign.location_category || campaign.caption_category, place].filter(Boolean).join(" • ")}</p>
              <p className="mt-4 text-base font-semibold leading-7 text-black/65">{campaign.location_description || campaignCaption(campaign) || "This is the campaign landing page for the post you saw. Use the actions below to plan it, view the location, or find something nearby."}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link href={`/plan?campaign=${encodeURIComponent(slug)}&q=${encodeURIComponent(campaign.location_name || campaignTitle(campaign))}`} className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-4 text-center text-sm font-black text-white shadow-lg shadow-rose-950/20">Plan this date</Link>
              {publicLocationUrl ? <Link href={publicLocationUrl} className="rounded-full border border-black/10 bg-[#1b1210] px-5 py-4 text-center text-sm font-black text-white">View location</Link> : <Link href="/create" className="rounded-full border border-black/10 bg-[#1b1210] px-5 py-4 text-center text-sm font-black text-white">View location</Link>}
              <Link href={`/reserve?location=${encodeURIComponent(campaign.location_source_id || campaign.location_name || "")}`} className="rounded-full border border-black/10 bg-white px-5 py-4 text-center text-sm font-black text-black/65">Reserve if available</Link>
              <Link href={`/create?q=${encodeURIComponent(`near ${campaign.location_name || place || "me"}`)}`} className="rounded-full border border-black/10 bg-white px-5 py-4 text-center text-sm font-black text-black/65">Find something nearby</Link>
            </div>

            {campaign.hashtags?.length ? (
              <div className="flex flex-wrap gap-2">
                {campaign.hashtags.slice(0, 8).map((tag) => <span key={tag} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">{tag}</span>)}
              </div>
            ) : null}
          </div>
        </article>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-700">Nearby ideas</p>
              <h2 className="mt-1 text-2xl font-black">Restaurants/activities nearby</h2>
            </div>
            <Link href="/go" className="rounded-full bg-[#1b1210] px-4 py-2 text-xs font-black text-white">Search more</Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {nearby.map((location) => (
              <Link key={location.id} href={locationHref(location)} className="grid grid-cols-[96px_1fr] gap-3 rounded-[1.5rem] border border-black/10 bg-white p-3 shadow-sm">
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
