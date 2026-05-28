import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import RecoveryRedirect from "@/components/RecoveryRedirect";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationDetailHref } from "@/lib/locationLinks";
import { getPrimaryCategory, getCuisine } from "@/lib/locationFields";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "TheOutHaven | Plan Better OUTings",
  description: "Discover restaurants, nightlife, experiences, and curated outing ideas personalized around your vibe, budget, and location.",
  alternates: { canonical: "https://www.theouthaven.com" },
};

type HomeLocation = {
  id: string;
  type: string | null;
  source_table: string | null;
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
  primary_category: string | null;
  cuisine: string | null;
  cuisine_type: string | null;
  activity_type: string | null;
  tags: string[] | null;
  vibes: string[] | null;
  website: string | null;
  reservation_url: string | null;
  external_reservation_url: string | null;
  rating: number | null;
  score: number | null;
  total_reviews: number | null;
  views_count: number | null;
  saves_count: number | null;
  reservation_count: number | null;
  featured: boolean | null;
};


export default async function HomePage() {
  const sections = await loadHomepageSections();

  return (
    <main className="min-h-screen bg-[#070303] text-white">
      <RecoveryRedirect />

      <section className="relative overflow-hidden px-5 pb-14 pt-32 sm:px-6 lg:pt-40">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(225,6,42,0.28),transparent_36%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,.1),transparent_24%),linear-gradient(150deg,#080303_0%,#160807_50%,#080303_100%)]" />
        <div className="mx-auto max-w-7xl space-y-10">
          <div className="space-y-5">
            <h1 className="max-w-4xl text-5xl font-black tracking-tight sm:text-7xl">Plan better OUTings.</h1>
            <p className="max-w-3xl text-lg text-white/70">Find the right restaurant, experience, and vibe in minutes, then book your night with confidence.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/create" className="rounded-full bg-[#e1062a] px-7 py-3 text-sm font-black hover:bg-red-500">Search and Plan</Link>
              <Link href="/explore" className="rounded-full border border-white/15 bg-white/[0.04] px-7 py-3 text-sm font-black">Explore Places</Link>
            </div>
          </div>

          <HomeSearchPrompt />

          <CarouselSection title="Featured Date Night Collections" subtitle="Curated romantic and social-ready picks for your next plan." locations={sections.featuredDateNightCollections} />
          <PlanByOccasion />
          <CarouselSection title="Popular Restaurants" subtitle="High-performing dining destinations people keep choosing." locations={sections.popularRestaurants} />
          <CarouselSection title="Popular Activities" subtitle="Top experiences for birthdays, celebrations, and group outings." locations={sections.popularActivities} />
          <TonightsVibe />
          <PopularAreas />
          <WhyUseTheOutHaven />

          <section className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-2xl font-black">How TheOutHaven works</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {["Tell us your vibe", "See premium matches", "Book and go OUT"].map((step, index) => (
                <div key={step} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-white/50">Step {index + 1}</p>
                  <p className="mt-2 text-lg font-black">{step}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="px-5 py-8 sm:px-6">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(225,6,42,.26),transparent_38%),#120907] p-8">
          <h2 className="text-3xl font-black">Let AI plan your next outing.</h2>
          <p className="mt-3 max-w-3xl text-white/70">Share your mood and budget, then get recommendations tailored for your kind of night.</p>
          <div className="mt-5 flex flex-wrap gap-3"><Link href="/create" className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black">Start Planning</Link><Link href="/explore" className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-black">Browse Locations</Link></div>
        </div>
      </section>

      <section className="px-5 pb-14 pt-2 sm:px-6">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-2xl">
          <h2 className="text-2xl font-black">Own or manage a location?</h2>
          <p className="mt-3 max-w-3xl text-white/70">Claim your business, control your presence, and connect with high-intent guests planning nights out.</p>
          <div className="mt-5 flex flex-wrap gap-3"><Link href="/location/apply" className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black">Claim Your Business</Link><Link href="/business" className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-black">Learn More</Link></div>
        </div>
      </section>
    </main>
  );
}

function HomeSearchPrompt() {
  const chips = ["Steak dinner and hookah in Queens", "Romantic rooftop", "Birthday dinner", "Brunch and activity"];
  return <section className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-6 sm:p-8"><h2 className="text-2xl font-black sm:text-3xl">What kind of outing are you planning?</h2><p className="mt-2 max-w-3xl text-white/70">Tell TheOutHaven the vibe, area, food, or activity you want — we&apos;ll help match the plan.</p><div className="mt-5 flex flex-col gap-3 sm:flex-row"><Link href="/create" className="flex-1 rounded-full border border-white/15 bg-black/30 px-5 py-3 text-left text-sm text-white/65 transition hover:border-white/30">Try: steak dinner and hookah in Queens</Link><Link href="/create" className="rounded-full bg-[#e1062a] px-6 py-3 text-center text-sm font-black hover:bg-red-500">Start Planning</Link></div><div className="mt-4 flex flex-wrap gap-2">{chips.map((chip) => <Link key={chip} href={`/create?prompt=${encodeURIComponent(chip)}`} className="rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-xs font-black text-white/80 transition hover:border-white/25 hover:bg-white/[0.08]">{chip}</Link>)}</div></section>;
}

function PlanByOccasion() {
  const cards = [{ title: "Birthday", description: "Plan a celebration dinner with the right energy.", prompt: "Birthday dinner with music" }, { title: "Date Night", description: "Build a romantic night with dinner and atmosphere.", prompt: "Romantic date night" }, { title: "Girls’ Night", description: "Mix dinner, drinks, and a social-ready spot.", prompt: "Girls night dinner and drinks" }, { title: "After Work Drinks", description: "Find a quick reset with food and cocktails.", prompt: "After work drinks and food" }];
  return <section><div className="mb-4"><h2 className="text-3xl font-black">Plan by Occasion</h2><p className="mt-1 text-sm text-white/65">Start with the moment — we&apos;ll help shape the plan.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <Link key={card.title} href={`/create?prompt=${encodeURIComponent(card.prompt)}`} className="group flex min-h-[172px] flex-col rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.06]"><h3 className="text-lg font-black">{card.title}</h3><p className="mt-2 text-sm text-white/70">{card.description}</p><p className="mt-auto pt-4 text-xs font-black uppercase tracking-[0.16em] text-white/75 group-hover:text-white">Start planning</p></Link>)}</div></section>;
}

function TonightsVibe() {
  const vibes = [{ label: "Romantic", prompt: "Romantic date night" }, { label: "Lively", prompt: "Lively dinner and lounge" }, { label: "Upscale", prompt: "Upscale restaurant and activity" }, { label: "Chill", prompt: "Chill food and activity nearby" }];
  return <section><div className="mb-4"><h2 className="text-3xl font-black">Tonight&apos;s Vibe</h2><p className="mt-1 text-sm text-white/65">Pick the mood and let TheOutHaven guide the plan.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{vibes.map((vibe) => <Link key={vibe.label} href={`/create?prompt=${encodeURIComponent(vibe.prompt)}`} className="flex min-h-[92px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-center text-sm font-black transition hover:border-white/20 hover:bg-white/[0.07]">{vibe.label}</Link>)}</div></section>;
}

function PopularAreas() {
  const areas = ["Queens", "Brooklyn", "Manhattan", "Astoria", "Jamaica", "Williamsburg", "Harlem", "Long Island City"];
  return <section><div className="mb-4"><h2 className="text-3xl font-black">Popular Areas</h2><p className="mt-1 text-sm text-white/65">Browse outing ideas around the neighborhoods people search most.</p></div><div className="flex flex-wrap gap-2">{areas.map((area) => <Link key={area} href={`/explore?borough=${encodeURIComponent(area)}`} className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-black text-white/85 transition hover:border-white/25 hover:bg-white/[0.08]">{area}</Link>)}</div></section>;
}

function WhyUseTheOutHaven() {
  const items = [{ title: "Personalized outing matches", description: "Find places that fit your vibe, area, and occasion." }, { title: "Restaurants + activities together", description: "Build a full plan instead of searching one place at a time." }, { title: "Save, call, or book faster", description: "Keep your options organized and take action when you’re ready." }];
  return <section><div className="mb-4"><h2 className="text-3xl font-black">Why people use TheOutHaven</h2></div><div className="grid gap-4 sm:grid-cols-3">{items.map((item) => <article key={item.title} className="flex min-h-[148px] flex-col rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4"><h3 className="text-base font-black">{item.title}</h3><p className="mt-2 text-sm text-white/70">{item.description}</p></article>)}</div></section>;
}

async function loadHomepageSections() {
  const { data } = await supabaseAdmin
    .from("locations")
    .select("id,type,source_table,name,restaurant_name,activity_name,business_name,main_image,image_url,images,city,neighborhood,category,primary_category,cuisine,cuisine_type,activity_type,tags,vibes,website,reservation_url,external_reservation_url,rating,score,total_reviews,views_count,saves_count,reservation_count,featured,is_searchable,is_hidden,data_status")
    .eq("is_searchable", true)
    .neq("is_hidden", true)
    .eq("data_status", "clean")
    .limit(500);
  const uniqueLocations = dedupeLocations(((data || []) as HomeLocation[]).filter((l) => Boolean(getLocationName(l, ""))));

  const seed = Math.floor(Date.now() / (1000 * 60 * 60 * 6));
  const usedIds = new Set<string>();
  const rotate = (items: HomeLocation[], offset: number) => {
    if (!items.length) return items;
    const pivot = (seed + offset) % items.length;
    return [...items.slice(pivot), ...items.slice(0, pivot)];
  };

  const pick = (items: HomeLocation[], limit = 4, offset = 0) => {
    const result: HomeLocation[] = [];
    for (const item of rotate(items, offset)) {
      if (!item.id || usedIds.has(item.id)) continue;
      usedIds.add(item.id);
      result.push(item);
      if (result.length === limit) break;
    }
    return result;
  };

  const dateNightPool = matchingLocations(uniqueLocations, ["date night", "romantic", "intimate", "upscale", "cocktail", "lounge", "fine dining"], { geo: ["manhattan", "new york"] });
  const popularRestaurantsPool = matchingLocations(uniqueLocations, ["restaurant", "dining", "brunch", "steakhouse", "sushi", "italian"], { restaurantOnly: true });
  const popularActivitiesPool = matchingLocations(uniqueLocations, ["activity", "arcade", "rooftop", "karaoke", "experience", "party", "bowling"], { activityOnly: true });

  return {
    featuredDateNightCollections: pick(dateNightPool, 4, 1),
    popularRestaurants: pick(popularRestaurantsPool, 4, 3),
    popularActivities: pick(popularActivitiesPool, 4, 5),
  };
}

function CarouselSection({ title, subtitle, locations }: { title: string; subtitle: string; locations: HomeLocation[] }) {
  if (!locations.length) return null;
  return (
    <section>
      <div className="mb-4"><h2 className="text-3xl font-black">{title}</h2><p className="mt-1 text-sm text-white/65">{subtitle}</p></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{locations.slice(0, 4).map((location) => <PlaceCard key={`${title}-${location.id}`} location={location} />)}</div>
    </section>
  );
}

function PlaceCard({ location }: { location: HomeLocation }) {
  const tags = getCardChips(location);
  const reserveHref = location.external_reservation_url || location.reservation_url || location.website || null;
  return <article className="group flex h-full min-h-[340px] flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-3 shadow-2xl shadow-black/30"><div className="relative h-44 w-full overflow-hidden rounded-2xl"><Image src={getLocationImage(location)} alt={getLocationName(location)} loading="lazy" fill sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></div><div className="mt-3 flex flex-1 flex-col"><h4 className="line-clamp-2 min-h-[3.5rem] text-lg font-black">{getLocationName(location)}</h4><p className="line-clamp-1 text-sm text-white/65">{getPrimaryCategory(location)} · {location.neighborhood || location.city || "New York"}</p><p className="line-clamp-1 text-xs text-white/60">{[getCuisine(location) || location.activity_type, location.rating ? `${location.rating.toFixed(1)} ★` : null].filter(Boolean).join(" · ") || "Curated on TheOutHaven"}</p><div className="mt-3 min-h-[3rem]">{tags.length ? <div className="flex flex-wrap gap-2">{tags.map((tag) => <span key={tag} className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[10px] font-black text-white/80">{tag}</span>)}</div> : null}</div><div className="mt-auto flex items-center gap-2 pt-4"><Link href={getLocationDetailHref({ id: location.id, type: location.type })} className="inline-block rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black">View Experience</Link>{reserveHref ? <a href={reserveHref} target="_blank" rel="noreferrer" className="inline-block rounded-full border border-white/20 bg-white/[0.05] px-4 py-2 text-xs font-black">Reserve / Visit</a> : null}</div></div></article>;
}

function normalizeLabel(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.map((item) => normalizeLabel(item)).filter(Boolean).join(", ");
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || ["[]", "{}", "null", "undefined"].includes(trimmed)) return "";
    if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
      try { return normalizeLabel(JSON.parse(trimmed)); } catch {}
    }
    return trimmed.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return String(value).trim();
}
function normalizeLabels(values: unknown, limit = 3): string[] {
  const rawValues = Array.isArray(values) ? values : [values];
  return rawValues.flatMap((value) => normalizeLabel(value).split(",").map((part) => part.trim()).filter(Boolean)).filter((label) => !["[]", "{}", "null", "undefined"].includes(label.toLowerCase())).filter((label, index, arr) => arr.findIndex((item) => item.toLowerCase() === label.toLowerCase()) === index).slice(0, limit);
}
function getCardChips(location: HomeLocation): string[] {
  return normalizeLabels([location.primary_category, location.category, location.cuisine, location.cuisine_type, location.activity_type, ...(Array.isArray(location.vibes) ? location.vibes : normalizeLabels(location.vibes, 3)), ...(Array.isArray(location.tags) ? location.tags : normalizeLabels(location.tags, 3))], 3);
}
function matchingLocations(locations: HomeLocation[], keywords: string[], options?: { geo?: string[]; restaurantOnly?: boolean; activityOnly?: boolean }) {
  return locations.filter((location) => {
    if (options?.restaurantOnly && !isRestaurant(location)) return false;
    if (options?.activityOnly && isRestaurant(location)) return false;
    if (options?.geo?.length && !inGeo(location, options.geo)) return false;
    return hasAny(location, keywords);
  }).sort((a, b) => score(b) - score(a));
}
function searchableText(location: HomeLocation) { return [location.source_table, location.type, location.name, location.restaurant_name, location.activity_name, location.business_name, location.city, location.neighborhood, location.category, location.primary_category, location.cuisine, location.cuisine_type, location.activity_type, ...(location.tags || []), ...(location.vibes || [])].filter(Boolean).join(" ").toLowerCase(); }
function hasAny(location: HomeLocation, keywords: string[]) { const hay = searchableText(location); return keywords.some((keyword) => hay.includes(keyword.toLowerCase())); }
function inGeo(location: HomeLocation, keywords: string[]) { const hay = `${location.city || ""} ${location.neighborhood || ""}`.toLowerCase(); return keywords.some((keyword) => hay.includes(keyword.toLowerCase())); }
function score(location: HomeLocation) { return (location.rating || location.score || 0) * 35 + (location.total_reviews || 0) * 1.5 + (location.views_count || 0) * 0.05 + (location.saves_count || 0) * 0.7 + (location.reservation_count || 0) * 1.2 + (location.featured ? 30 : 0); }
function isRestaurant(location: HomeLocation) { const hay = searchableText(location); return hay.includes("restaurant") || Boolean(location.restaurant_name) || String(location.source_table || "").toLowerCase() === "restaurants"; }
function dedupeLocations(locations: HomeLocation[]) { const seen = new Set<string>(); return locations.filter((l) => (l.id && !seen.has(l.id) ? (seen.add(l.id), true) : false)); }
