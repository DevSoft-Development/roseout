import type { Metadata } from "next";
import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import RecoveryRedirect from "@/components/RecoveryRedirect";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationDetailHref } from "@/lib/locationLinks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "TheOutHaven | Plan Better OUTings",
  description: "Discover restaurants, nightlife, experiences, and curated outing ideas personalized around your vibe, budget, and location.",
  alternates: { canonical: "https://www.theouthaven.com" },
  openGraph: {
    title: "TheOutHaven | Plan Better OUTings",
    description: "Discover restaurants, nightlife, experiences, and curated outing ideas personalized around your vibe, budget, and location.",
    url: "https://www.theouthaven.com",
    siteName: "TheOutHaven",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TheOutHaven | Plan Better OUTings",
    description: "Discover restaurants, nightlife, experiences, and curated outing ideas personalized around your vibe, budget, and location.",
  },
};

type HomeLocation = {
  id: string;
  type: string | null;
  name: string | null;
  restaurant_name: string | null;
  activity_name: string | null;
  business_name: string | null;
  main_image: string | null;
  image_url: string | null;
  images: string[] | null;
  city: string | null;
  neighborhood: string | null;
  category: string | null;
  cuisine: string | null;
  cuisine_type: string | null;
  tags: string[] | null;
  vibes: string[] | null;
  rating: number | null;
  score: number | null;
  total_reviews: number | null;
  views_count: number | null;
  saves_count: number | null;
  reservation_count: number | null;
  featured: boolean | null;
  price_level: number | null;
};

type HomeSections = Awaited<ReturnType<typeof loadHomepageSections>>;

export default async function HomePage() {
  const sections = await loadHomepageSections();

  return (
    <main className="min-h-screen bg-[#070303] text-white">
      <RecoveryRedirect />
      <TheOutHavenHeader />

      <section className="relative overflow-hidden px-5 pb-20 pt-32 sm:px-6 lg:pt-40">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(225,6,42,0.28),transparent_36%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,.1),transparent_24%),linear-gradient(150deg,#080303_0%,#160807_50%,#080303_100%)]" />
        <div className="mx-auto max-w-7xl space-y-9">
          <div className="space-y-5">
            <h1 className="max-w-4xl text-5xl font-black tracking-tight sm:text-7xl">Plan better OUTings.</h1>
            <p className="max-w-3xl text-lg text-white/70">Discover restaurants, nightlife, experiences, and curated outing ideas personalized around your vibe, budget, and location.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/create" className="rounded-full bg-[#e1062a] px-7 py-3 text-sm font-black hover:bg-red-500">Create an Outing</Link>
              <Link href="/explore" className="rounded-full border border-white/15 bg-white/[0.04] px-7 py-3 text-sm font-black">Explore Places</Link>
            </div>
          </div>

          <FeaturedExperienceGrid sections={sections} />
          <SocialProofStrip sections={sections} />

          <div className="space-y-6">
            <CarouselSection title="Trending Restaurants" subtitle="Most saved, highly rated, and trending tonight." locations={sections.trendingRestaurants} />
            <CarouselSection title="Trending Activities" subtitle="Popular this weekend with social groups and date-night planners." locations={sections.trendingActivities} />
          </div>
        </div>
      </section>

      <section className="px-5 py-10 sm:px-6"><div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(225,6,42,.26),transparent_38%),#120907] p-8"><h2 className="text-3xl font-black">Let AI plan your next outing.</h2><p className="mt-3 max-w-3xl text-white/70">Tell TheOutHaven what kind of experience you want and get personalized restaurant and activity recommendations.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/create" className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black">Start Planning</Link><Link href="/explore" className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-black">Explore Experiences</Link></div></div></section>

      <section className="px-5 py-10 sm:px-6"><div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 shadow-2xl"><h2 className="text-3xl font-black">Own or manage a location?</h2><p className="mt-3 max-w-3xl text-white/70">Claim your business, manage reservations, grow visibility, and connect with more customers through TheOutHaven.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/location/apply" className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black">Claim Your Business</Link><Link href="/business" className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-black">Learn More</Link></div></div></section>

      <PublicFooter />
    </main>
  );
}

async function loadHomepageSections() {
  const { data } = await supabaseAdmin
    .from("locations")
    .select("id,type,name,restaurant_name,activity_name,business_name,main_image,image_url,images,city,neighborhood,category,cuisine,cuisine_type,tags,vibes,rating,score,total_reviews,views_count,saves_count,reservation_count,featured,price_level")
    .limit(180);

  const locations = ((data || []) as HomeLocation[]).filter((location) => Boolean(getLocationName(location, "")));

  return {
    trendingRestaurants: rankByTrending(locations.filter((location) => isRestaurant(location))).slice(0, 12),
    trendingActivities: rankByTrending(locations.filter((location) => !isRestaurant(location))).slice(0, 12),
    experiences: [
      { key: "date-night", title: "Date Night", subtitle: "Romantic Manhattan Spots", tags: ["Intimate", "Cocktails", "Late Night"], cta: "Plan This Outing", locations: byKeywords(locations, ["date", "romantic", "lounge", "cocktail", "intimate", "upscale"]).slice(0, 4) },
      { key: "rooftops", title: "Rooftops", subtitle: "Best Rooftops in Brooklyn", tags: ["Skyline", "Golden Hour", "DJ Sets"], cta: "View Experience", locations: byKeywords(locations, ["rooftop", "skyline", "terrace"]).slice(0, 4) },
      { key: "brunch", title: "Brunch", subtitle: "Weekend Brunch Socials", tags: ["Day Party", "Bottomless", "Friends"], cta: "View Experience", locations: byKeywords(locations, ["brunch", "day party", "daytime", "breakfast"]).slice(0, 4) },
      { key: "luxury", title: "Luxury", subtitle: "Luxury Dinner Experiences", tags: ["Chef-led", "Fine Dining", "Premium"], cta: "Plan This Outing", locations: byKeywords(locations, ["luxury", "premium", "fine dining", "upscale", "chef"]).sort((a, b) => (b.price_level || 0) - (a.price_level || 0)).slice(0, 4) },
      { key: "group-outings", title: "Group Outings", subtitle: "Group-Friendly Lounges", tags: ["Large Parties", "Birthdays", "Celebrations"], cta: "Plan This Outing", locations: byKeywords(locations, ["group", "party", "birthday", "celebration", "private"]).slice(0, 4) },
    ],
  };
}

function FeaturedExperienceGrid({ sections }: { sections: HomeSections }) {
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {sections.experiences.map((experience, index) => {
        const primary = experience.locations[0];
        if (!primary) return null;
        const name = getLocationName(primary);
        const neighborhood = primary.neighborhood || primary.city || "NYC";
        const featuredClass = index === 0 ? "lg:col-span-7 lg:row-span-2" : index === 1 ? "lg:col-span-5" : "lg:col-span-4";

        return (
          <article key={experience.key} className={`group relative min-h-[260px] overflow-hidden rounded-[1.8rem] border border-white/10 ${featuredClass}`}>
            <img src={getLocationImage(primary)} alt={name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.15)_0%,rgba(7,3,3,0.75)_58%,rgba(7,3,3,0.96)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,0.35),transparent_45%)]" />
            <div className="relative flex h-full flex-col justify-end p-5 sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.26em] text-white/70">{experience.title}</p>
              <h3 className="mt-2 text-2xl font-black sm:text-3xl">{experience.subtitle}</h3>
              <p className="mt-2 text-sm text-white/75">Featuring {name} · {neighborhood}</p>
              <div className="mt-4 flex flex-wrap gap-2">{experience.tags.map((tag) => <span key={tag} className="rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[11px] font-black">{tag}</span>)}</div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="line-clamp-1 text-xs text-white/70">{experience.locations.slice(1, 4).map((l) => getLocationName(l)).join(" · ") || "Curated by TheOutHaven"}</p>
                <Link href="/create" className="rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black">{experience.cta}</Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function SocialProofStrip({ sections }: { sections: HomeSections }) {
  const bestRated = rankByTrending([...sections.trendingRestaurants, ...sections.trendingActivities]).slice(0, 4);
  const stats = [
    { label: "Trending Tonight", value: sections.trendingRestaurants.length },
    { label: "Most Saved", value: bestRated.reduce((sum, item) => sum + (item.saves_count || 0), 0) },
    { label: "Popular This Weekend", value: sections.trendingActivities.length },
    { label: "Highly Rated Nearby", value: bestRated.filter((item) => (item.rating || item.score || 0) >= 4.5).length },
  ];

  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{stats.map((item) => <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/25"><p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/55">{item.label}</p><p className="mt-2 text-2xl font-black text-white">{item.value.toLocaleString()}</p></div>)}</div>;
}

function CarouselSection({ title, subtitle, locations }: { title: string; subtitle: string; locations: HomeLocation[] }) {
  return <section><div className="mb-4"><h2 className="text-3xl font-black">{title}</h2><p className="mt-1 text-sm text-white/65">{subtitle}</p></div><div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{locations.map((location) => <PlaceCard key={`${title}-${location.id}`} location={location} />)}</div></section>;
}

function PlaceCard({ location }: { location: HomeLocation }) {
  const name = getLocationName(location);
  const neighborhood = location.neighborhood || location.city || "New York";
  const rating = (location.rating || location.score || 0).toFixed(1);
  const tags = [...(location.vibes || []), ...(location.tags || [])].filter(Boolean).slice(0, 3);

  return <article className="group min-w-[285px] rounded-3xl border border-white/10 bg-white/[0.04] p-3 shadow-2xl shadow-black/30 sm:min-w-[320px]"><div className="relative overflow-hidden rounded-2xl"><img src={getLocationImage(location)} alt={name} loading="lazy" className="h-44 w-full object-cover transition duration-500 group-hover:scale-105" /><div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent" /></div><h4 className="mt-3 text-lg font-black">{name}</h4><p className="text-sm text-white/65">{neighborhood} · {rating} ★</p>{tags.length ? <div className="mt-2 flex flex-wrap gap-2">{tags.map((tag) => <span key={tag} className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[10px] font-black text-white/80">{tag}</span>)}</div> : null}<Link href={getLocationDetailHref({ id: location.id, type: location.type })} className="mt-4 inline-block rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black">View Experience</Link></article>;
}

function rankByTrending(locations: HomeLocation[]) {
  return [...locations].sort((a, b) => score(b) - score(a));
}

function byKeywords(locations: HomeLocation[], keywords: string[]) {
  return [...locations]
    .filter((location) => keywords.some((keyword) => searchableText(location).includes(keyword)))
    .sort((a, b) => score(b) - score(a));
}

function searchableText(location: HomeLocation) {
  return [location.category, location.cuisine, location.cuisine_type, ...(location.tags || []), ...(location.vibes || [])].join(" ").toLowerCase();
}

function score(location: HomeLocation) {
  return (location.rating || location.score || 0) * 35 + (location.total_reviews || 0) * 1.5 + (location.views_count || 0) * 0.05 + (location.saves_count || 0) * 0.7 + (location.reservation_count || 0) * 1.2 + (location.featured ? 30 : 0);
}

function isRestaurant(location: HomeLocation) {
  const kind = String(location.type || "").toLowerCase();
  return kind.includes("restaurant") || Boolean(location.restaurant_name) || searchableText(location).includes("restaurant");
}

function PublicFooter() { const links = [["Home","/"],["Explore","/explore"],["Create Outing","/create"],["Business","/business"],["Sign In","/signup"],["Terms","/terms"],["Privacy","/privacy"],["SMS Terms","/sms-terms"],["Contact","/contact"]] as const; return <footer className="mt-12 border-t border-white/10 bg-black/50 px-5 py-10 sm:px-6"><div className="mx-auto max-w-7xl"><div className="flex flex-wrap gap-4 text-sm text-white/70">{links.map(([label,href])=><Link key={label} href={href} className="hover:text-white">{label}</Link>)}</div><div className="mt-5 flex gap-3 text-white/55"><span>◎</span><span>◉</span><span>◌</span></div><p className="mt-4 text-xs text-white/45">© {new Date().getFullYear()} TheOutHaven. All rights reserved.</p></div></footer>; }
