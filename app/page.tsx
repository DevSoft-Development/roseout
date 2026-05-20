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

const planningCategories = [
  { label: "Date Night", slug: "date-night" },
  { label: "Brunch", slug: "brunch" },
  { label: "Rooftops", slug: "rooftops" },
  { label: "Girls Night", slug: "girls-night" },
  { label: "Group Outing", slug: "group-outing" },
  { label: "Luxury Dinner", slug: "luxury-dinner" },
  { label: "Hookah + Lounge", slug: "hookah-lounge" },
  { label: "Live Music", slug: "live-music" },
  { label: "Birthday", slug: "birthday" },
  { label: "Drinks + Activity", slug: "drinks-activity" },
] as const;

export default async function HomePage() {
  const sections = await loadHomepageSections();

  return (
    <main className="min-h-screen bg-[#070303] text-white">
      <RecoveryRedirect />
      <TheOutHavenHeader />

      <section className="relative overflow-hidden px-5 pb-20 pt-32 sm:px-6 lg:pt-40">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(225,6,42,0.28),transparent_36%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,.1),transparent_24%),linear-gradient(150deg,#080303_0%,#160807_50%,#080303_100%)]" />
        <div className="mx-auto max-w-7xl space-y-8">
          <h1 className="max-w-4xl text-5xl font-black tracking-tight sm:text-7xl">Plan better OUTings.</h1>
          <p className="max-w-3xl text-lg text-white/70">Discover restaurants, nightlife, experiences, and curated outing ideas personalized around your vibe, budget, and location.</p>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur">
            <h2 className="text-xl font-black sm:text-2xl">What are you planning?</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {planningCategories.map((category) => (
                <Link key={category.slug} href={`/create?category=${category.slug}`} className="group rounded-2xl border border-white/10 bg-black/35 px-4 py-4 text-center text-sm font-bold text-white/90 transition duration-200 hover:-translate-y-0.5 hover:border-[#e1062a]/65 hover:bg-[#e1062a]/15 hover:shadow-[0_0_22px_rgba(225,6,42,0.35)]">
                  <span className="inline-block transition group-hover:text-white">{category.label}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/create" className="rounded-full bg-[#e1062a] px-7 py-3 text-sm font-black hover:bg-red-500">Create an Outing</Link>
            <Link href="/explore" className="rounded-full border border-white/15 bg-white/[0.04] px-7 py-3 text-sm font-black">Explore Places</Link>
          </div>
        </div>
      </section>

      {sections.map((section) => (
        <Section key={section.title} title={section.title} subtitle={section.subtitle}>
          <LocationGrid locations={section.locations} cta={section.ctaLabel} />
        </Section>
      ))}

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
    .limit(120);

  const locations = ((data || []) as HomeLocation[]).filter((location) => Boolean(getLocationName(location, "")));

  return [
    { title: "Trending Restaurants", subtitle: "Highest rated, most viewed, and most reserved dining spots.", locations: rankByTrending(locations.filter((location) => isRestaurant(location))).slice(0, 6), ctaLabel: "Reserve" },
    { title: "Trending Activities", subtitle: "The most saved and frequently booked experiences right now.", locations: rankByTrending(locations.filter((location) => !isRestaurant(location))).slice(0, 6), ctaLabel: "Plan This Outing" },
    { title: "Date Night", subtitle: "Romantic vibes, upscale dining, and late-night energy.", locations: byKeywords(locations, ["date", "romantic", "lounge", "cocktail", "intimate", "upscale"]).slice(0, 6), ctaLabel: "Plan This Outing" },
    { title: "Rooftops", subtitle: "Skyline views, rooftop lounges, and elevated city nights.", locations: byKeywords(locations, ["rooftop", "skyline", "terrace"]).slice(0, 6), ctaLabel: "View" },
    { title: "Brunch", subtitle: "Daytime favorites with top brunch tags and popularity.", locations: byKeywords(locations, ["brunch", "day party", "daytime", "breakfast"]).slice(0, 6), ctaLabel: "Reserve" },
    { title: "Luxury", subtitle: "Premium pricing and upscale luxury vibes.", locations: byKeywords(locations, ["luxury", "premium", "fine dining", "upscale", "chef"]).sort((a, b) => (b.price_level || 0) - (a.price_level || 0)).slice(0, 6), ctaLabel: "Reserve" },
    { title: "Group Outings", subtitle: "Group-friendly venues, activities, and social experiences.", locations: byKeywords(locations, ["group", "party", "birthday", "celebration", "private"]).slice(0, 6), ctaLabel: "Plan This Outing" },
  ].filter((section) => section.locations.length > 0);
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

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="px-5 py-10 sm:px-6"><div className="mx-auto max-w-7xl"><h2 className="text-3xl font-black">{title}</h2><p className="mt-2 text-sm text-white/65">{subtitle}</p><div className="mt-6">{children}</div></div></section>;
}

function LocationGrid({ locations, cta }: { locations: HomeLocation[]; cta: string }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{locations.map((location) => <PlaceCard key={location.id} location={location} cta={cta} />)}</div>;
}

function PlaceCard({ location, cta }: { location: HomeLocation; cta: string }) { const name = getLocationName(location); const neighborhood = location.neighborhood || location.city || "New York"; const rating = (location.rating || location.score || 0).toFixed(1); const cuisine = location.cuisine || location.cuisine_type || location.category || "Experience"; const tags = [...(location.vibes || []), ...(location.tags || [])].filter(Boolean).slice(0, 3);
  return <article className="group rounded-3xl border border-white/10 bg-white/[0.04] p-3 transition hover:-translate-y-1 hover:border-[#e1062a]/45"><img src={getLocationImage(location)} alt={name} loading="lazy" className="h-40 w-full rounded-2xl object-cover" /><h4 className="mt-3 font-black">{name}</h4><p className="text-sm text-white/65">{neighborhood} · {rating} ★</p><p className="mt-1 text-xs text-red-200">{cuisine}</p>{tags.length ? <p className="mt-1 text-xs text-white/70">{tags.join(" · ")}</p> : null}<Link href={getLocationDetailHref({ id: location.id, type: location.type })} className="mt-3 inline-block text-xs font-black text-white/80 group-hover:text-white">{cta} →</Link></article>; }

function PublicFooter() { const links = [["Home","/"],["Explore","/explore"],["Create Outing","/create"],["Business","/business"],["Sign In","/signup"],["Terms","/terms"],["Privacy","/privacy"],["SMS Terms","/sms-terms"],["Contact","/contact"]] as const; return <footer className="mt-12 border-t border-white/10 bg-black/50 px-5 py-10 sm:px-6"><div className="mx-auto max-w-7xl"><div className="flex flex-wrap gap-4 text-sm text-white/70">{links.map(([label,href])=><Link key={label} href={href} className="hover:text-white">{label}</Link>)}</div><div className="mt-5 flex gap-3 text-white/55"><span>◎</span><span>◉</span><span>◌</span></div><p className="mt-4 text-xs text-white/45">© {new Date().getFullYear()} TheOutHaven. All rights reserved.</p></div></footer>; }
