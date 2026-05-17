import type { Metadata } from "next";
import Link from "next/link";
import {
  campaignCaption,
  campaignImage,
  campaignPlace,
  campaignTitle,
  loadActiveBioSlug,
  loadFeaturedLocations,
  loadPublicCampaigns,
  locationCategory,
  locationHref,
  locationImage,
  locationName,
  type PublicCampaign,
} from "@/lib/marketing-public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Link in Bio | TheOutHaven",
  description: "Find the restaurant, activity, date idea, or campaign you saw on TheOutHaven social.",
};

function CampaignCard({ campaign, featured = false }: { campaign: PublicCampaign; featured?: boolean }) {
  const slug = campaign.public_slug || "";
  return (
    <Link href={slug ? `/go/${slug}` : "/go"} className={`group overflow-hidden rounded-[1.75rem] border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${featured ? "border-rose-200" : "border-black/10"}`}>
      <div className={`relative ${featured ? "h-64" : "h-44"} bg-[#eadfd8]`}>
        <img src={campaignImage(campaign)} alt={campaign.location_name || campaignTitle(campaign)} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#1b1210]">
          {campaign.caption_category || campaign.location_category || "Featured"}
        </span>
        {featured && <span className="absolute right-4 top-4 rounded-full bg-rose-600 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white">Active bio link</span>}
        <div className="absolute bottom-4 left-4 right-4 text-white">
          <h2 className={`${featured ? "text-3xl" : "text-xl"} font-black leading-tight`}>{campaignTitle(campaign)}</h2>
          <p className="mt-1 text-sm font-bold text-white/75">{[campaign.location_name, campaignPlace(campaign)].filter(Boolean).join(" • ") || "Tap to plan"}</p>
        </div>
      </div>
      <div className="p-4">
        <p className="line-clamp-3 text-sm font-semibold leading-6 text-black/55">{campaign.location_description || campaignCaption(campaign)}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="rounded-full bg-[#1b1210] px-4 py-2 text-xs font-black text-white">Open campaign</span>
          <span className="text-xs font-black uppercase tracking-wide text-rose-700">Plan this →</span>
        </div>
      </div>
    </Link>
  );
}

export default async function GoPage() {
  const [campaigns, activeSlug, locations] = await Promise.all([
    loadPublicCampaigns(12),
    loadActiveBioSlug(),
    loadFeaturedLocations(8),
  ]);

  const activeCampaign = campaigns.find((campaign) => campaign.public_slug === activeSlug) || null;
  const latestCampaigns = activeCampaign ? campaigns.filter((campaign) => campaign.id !== activeCampaign.id) : campaigns;

  return (
    <main className="min-h-screen bg-[#fff8f3] text-[#1b1210]">
      <section className="mx-auto max-w-3xl px-4 pb-12 pt-5">
        <div className="relative overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_32%),linear-gradient(135deg,#1b1210,#090706_65%,#3a1715)] p-5 text-white shadow-2xl">
          <div className="absolute right-[-70px] top-[-70px] h-52 w-52 rounded-full bg-rose-500/30 blur-3xl" />
          <div className="relative z-10">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-200">TheOutHaven social</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">What did you see on social?</h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-white/65">Search the spot, open the latest campaign, or jump into a date idea without going back to the homepage.</p>
            <form action="/create" className="mt-5 rounded-full border border-white/15 bg-white p-2 shadow-xl">
              <div className="flex items-center gap-2">
                <input name="q" placeholder="Search the spot you saw" className="min-w-0 flex-1 rounded-full px-4 py-3 text-sm font-bold text-[#1b1210] outline-none" />
                <button className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white">Search</button>
              </div>
            </form>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["Restaurants", "/create?q=restaurants"],
                ["Activities", "/create?q=activities"],
                ["Date Ideas", "/plan"],
              ].map(([label, href]) => (
                <Link key={label} href={href} className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-3 text-center text-xs font-black text-white/80">{label}</Link>
              ))}
            </div>
          </div>
        </div>

        {activeCampaign && (
          <section className="mt-5">
            <CampaignCard campaign={activeCampaign} featured />
          </section>
        )}

        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-700">Latest featured posts</p>
              <h2 className="mt-1 text-2xl font-black">Campaigns from social</h2>
            </div>
            <Link href="/plan" className="rounded-full bg-[#1b1210] px-4 py-2 text-xs font-black text-white">Plan your date</Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {latestCampaigns.length ? latestCampaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />) : (
              <div className="rounded-[1.75rem] border border-black/10 bg-white p-6 text-center sm:col-span-2">
                <p className="text-lg font-black">No public campaigns yet</p>
                <p className="mt-1 text-sm font-semibold text-black/50">Search for a restaurant, activity, or date idea above.</p>
              </div>
            )}
          </div>
        </section>

        <section className="mt-8">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-700">Campaign/location cards</p>
          <h2 className="mt-1 text-2xl font-black">Featured locations</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {locations.map((location) => (
              <Link key={location.id} href={locationHref(location)} className="grid grid-cols-[96px_1fr] gap-3 rounded-[1.5rem] border border-black/10 bg-white p-3 shadow-sm">
                <img src={locationImage(location)} alt={locationName(location)} className="h-24 w-24 rounded-[1.1rem] object-cover" />
                <div className="min-w-0 py-1">
                  <p className="truncate text-base font-black">{locationName(location)}</p>
                  <p className="mt-1 text-xs font-black uppercase tracking-wide text-rose-700">{locationCategory(location)}</p>
                  <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-black/45">{[location.city, location.state].filter(Boolean).join(", ") || location.description || "Featured on TheOutHaven"}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
