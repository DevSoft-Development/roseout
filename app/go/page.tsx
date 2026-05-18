import type { Metadata } from "next";
import type React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  campaignCaption,
  campaignImage,
  campaignPlace,
  campaignTitle,
  loadPublicCampaigns,
  type PublicCampaign,
} from "@/lib/marketing-public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Link in Bio | TheOutHaven",
  description: "Find the restaurant, activity, date idea, or campaign you saw on TheOutHaven social.",
};

const categoryCards = [
  { title: "Restaurants", text: "Dinner, brunch, lounges, and save-worthy food finds.", href: "/create?prompt=restaurants" },
  { title: "Activities", text: "Bowling, museums, games, shows, and more things to do.", href: "/create?prompt=activities" },
  { title: "Date Ideas", text: "Ready-to-plan combinations for better nights out.", href: "/plan" },
  { title: "Hidden Gems", text: "Underrated spots and local picks worth opening now.", href: "/create?prompt=hidden%20gems" },
];

const steps = [
  ["01", "Find the spot", "Search what you saw or open the latest featured campaign."],
  ["02", "Plan your outing", "Keep the exact social location and add nearby complements."],
  ["03", "Enjoy your night", "Use directions, reservation links, and details in one place."],
];

function buildCampaignPlanHref(campaign: PublicCampaign) {
  const params = new URLSearchParams({
    campaignSlug: campaign.public_slug || "",
    planExact: "true",
  });

  if (campaign.location_source_id) params.set("locationId", campaign.location_source_id);
  if (campaign.location_source_type) params.set("sourceTable", campaign.location_source_type);

  return `/create?${params.toString()}`;
}

function Pill({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${dark ? "bg-[#1b1210] text-white" : "bg-white/90 text-[#1b1210]"}`}>
      {children}
    </span>
  );
}

function CampaignCard({ campaign }: { campaign: PublicCampaign }) {
  const slug = campaign.public_slug || "";
  const place = campaignPlace(campaign);
  const imageUrl = campaign.location_image_url?.trim();
  const title = campaignTitle(campaign);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-black/10 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl">
      <Link href={slug ? `/go/${slug}` : "/go"} className="relative block overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.26),transparent_34%),linear-gradient(135deg,#1b1210,#050505_70%,#3a1715)]">
        <div className="relative aspect-[4/3] w-full">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={campaign.location_name || title}
              fill
              sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-white">
              <p className="text-2xl font-black tracking-[-0.04em]">{title}</p>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <div className="absolute left-4 right-4 top-4 flex flex-wrap gap-2">
            <Pill>{campaign.caption_category || campaign.location_category || "Featured"}</Pill>
            {campaign.source_platform ? <Pill dark>{campaign.source_platform}</Pill> : null}
          </div>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-xl font-black leading-tight tracking-[-0.03em] text-[#1b1210]">{title}</h3>
        <p className="mt-2 text-sm font-black uppercase tracking-[0.14em] text-rose-700">{[campaign.location_city, campaign.location_state].filter(Boolean).join(", ") || place || "TheOutHaven pick"}</p>
        <p className="mt-3 line-clamp-3 text-sm font-semibold leading-6 text-black/55">{campaign.location_description || campaignCaption(campaign)}</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Link href={buildCampaignPlanHref(campaign)} className="rounded-full bg-gradient-to-r from-rose-500 via-red-600 to-rose-700 px-4 py-3 text-center text-xs font-black text-white shadow-lg shadow-rose-950/15">Plan this outing</Link>
          <Link href={slug ? `/go/${slug}` : "/go"} className="rounded-full bg-[#1b1210] px-4 py-3 text-center text-xs font-black text-white">View campaign</Link>
        </div>
      </div>
    </article>
  );
}

export default async function GoPage() {
  const campaigns = await loadPublicCampaigns(12);

  return (
    <main className="min-h-screen bg-[#fff8f3] text-[#1b1210]">
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(244,63,94,0.28),transparent_32%),linear-gradient(135deg,#1b1210_0%,#050505_62%,#3a1715_100%)] px-4 pb-14 pt-24 text-white sm:px-6 lg:pt-32">
        <div className="absolute right-[-8rem] top-10 h-72 w-72 rounded-full bg-rose-500/25 blur-3xl" />
        <div className="absolute bottom-[-9rem] left-[-8rem] h-72 w-72 rounded-full bg-red-700/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-200">TheOutHaven social</p>
            <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[0.92] tracking-[-0.06em] sm:text-7xl lg:text-8xl">
              What did you see on <span className="text-rose-400">social?</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-white/68 sm:text-lg">Search the spot, open the latest campaign, or jump into a date idea without going back to the homepage.</p>
            <form action="/create" className="mt-7 max-w-2xl rounded-[1.35rem] border border-white/15 bg-white p-2 shadow-2xl shadow-black/30 sm:rounded-full">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input name="prompt" placeholder="Search the spot you saw" className="min-w-0 flex-1 rounded-full px-5 py-4 text-sm font-bold text-[#1b1210] outline-none" />
                <button className="rounded-full bg-gradient-to-r from-rose-500 via-red-600 to-rose-700 px-7 py-4 text-sm font-black text-white shadow-lg shadow-rose-950/20">Search</button>
              </div>
            </form>
            <div className="mt-5 flex flex-wrap gap-3">
              {[
                ["Restaurants", "/create?prompt=restaurants"],
                ["Activities", "/create?prompt=activities"],
                ["Date Ideas", "/plan"],
              ].map(([label, href]) => (
                <Link key={label} href={href} className="rounded-full border border-white/15 bg-white/[0.08] px-5 py-3 text-sm font-black text-white/82 backdrop-blur transition hover:bg-white/15">{label}</Link>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.08] p-3 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="rounded-[1.6rem] bg-[#fff8f3] p-4 text-[#1b1210]">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-700">Latest Featured Posts</p>
              <div className="mt-4 grid gap-3">
                {campaigns.slice(0, 3).map((campaign) => (
                  <Link key={campaign.id} href={campaign.public_slug ? `/go/${campaign.public_slug}` : "/go"} className="grid grid-cols-[88px_1fr] gap-3 rounded-[1.25rem] bg-white p-3 shadow-sm">
                    <div className="relative h-24 w-[88px] overflow-hidden rounded-[1rem] bg-[#eadfd8]">
                      <Image src={campaignImage(campaign)} alt={campaignTitle(campaign)} fill sizes="88px" className="object-cover" />
                    </div>
                    <div className="min-w-0 py-1">
                      <p className="truncate text-base font-black">{campaignTitle(campaign)}</p>
                      <p className="mt-1 truncate text-xs font-bold text-black/45">{[campaign.location_name, campaignPlace(campaign)].filter(Boolean).join(" • ")}</p>
                      <span className="mt-3 inline-flex rounded-full bg-[#1b1210] px-3 py-1.5 text-[10px] font-black text-white">View campaign</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-700">Latest Featured Posts</p>
            <h2 className="mt-2 text-4xl font-black tracking-[-0.05em] sm:text-5xl">Campaigns from social</h2>
          </div>
          <Link href="/go" className="w-fit rounded-full bg-[#1b1210] px-5 py-3 text-sm font-black text-white">View all campaigns</Link>
        </div>
        <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.length ? campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />) : (
            <div className="rounded-[1.75rem] border border-black/10 bg-white p-8 text-center md:col-span-2 xl:col-span-3">
              <p className="text-lg font-black">No public campaigns yet</p>
              <p className="mt-1 text-sm font-semibold text-black/50">Search for a restaurant, activity, or date idea above.</p>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6">
        <div className="overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.25),transparent_32%),linear-gradient(135deg,#1b1210,#050505_70%,#3a1715)] p-6 text-white shadow-2xl sm:p-9">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="text-3xl font-black tracking-[-0.04em]">Can’t find what you saw?</h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/62">Search any restaurant, activity, or location to start planning your perfect outing.</p>
            </div>
            <Link href="/create" className="rounded-full bg-gradient-to-r from-rose-500 via-red-600 to-rose-700 px-7 py-4 text-center text-sm font-black text-white shadow-lg shadow-rose-950/20">Search now</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-700">Explore by category</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categoryCards.map((card) => (
            <Link key={card.title} href={card.href} className="rounded-[1.75rem] border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
              <h3 className="text-2xl font-black tracking-[-0.04em]">{card.title}</h3>
              <p className="mt-3 text-sm font-semibold leading-6 text-black/55">{card.text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-700">How it works</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {steps.map(([number, title, text]) => (
            <div key={title} className="rounded-[1.75rem] border border-black/10 bg-white p-6 shadow-sm">
              <span className="text-sm font-black text-rose-700">{number}</span>
              <h3 className="mt-3 text-2xl font-black tracking-[-0.04em]">{title}</h3>
              <p className="mt-3 text-sm font-semibold leading-6 text-black/55">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
