import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationDetailHref } from "@/lib/locationLinks";
import { getPrimaryCategory, getCuisine } from "@/lib/locationFields";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ExploreLocation = {
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
  borough: string | null;
  neighborhood: string | null;
  category: string | null;
  primary_category: string | null;
  cuisine: string | null;
  cuisine_type: string | null;
  activity_type: string | null;
  tags: string[] | string | null;
  vibes: string[] | string | null;
  atmosphere: string[] | string | null;
  best_for: string[] | string | null;
  date_style_tags: string[] | string | null;
  search_keywords: string[] | string | null;
  reservation_url: string | null;
  external_reservation_url: string | null;
  website: string | null;
  rating: number | null;
  score: number | null;
  total_reviews: number | null;
  views_count: number | null;
  saves_count: number | null;
  reservation_count: number | null;
  featured: boolean | null;
  created_at: string | null;
};

const CHIP_PROMPTS = [
  "Date Night",
  "Dinner",
  "Brunch",
  "Rooftops",
  "Lounges",
  "Hookah",
  "Desserts",
  "Group Outings",
  "Luxury",
  "Outdoor",
] as const;

export default async function ExplorePage() {
  const data = await loadExploreData();
  if (!data.locations.length) {
    return (
      <main className="min-h-screen bg-[#070303] text-white">
        <TheOutHavenHeader />
        <section className="mx-auto max-w-7xl px-5 pb-20 pt-32 sm:px-6">
          <EmptyState />
        </section>
        <PublicFooter />
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070303] text-white">
      <TheOutHavenHeader />
      <section className="relative overflow-hidden px-5 pb-16 pt-32 sm:px-6 lg:pt-40">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(225,6,42,0.28),transparent_36%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,.1),transparent_24%),linear-gradient(150deg,#080303_0%,#160807_50%,#080303_100%)]" />
        <div className="mx-auto max-w-7xl space-y-8">
          <HeroSection data={data} />
          <CategoryChips />
          <EditorialGrid locations={data.locations} />
          <ExploreRails rails={data.rails} />
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}

async function loadExploreData() {
  const { data } = await supabaseAdmin.from("locations").select("*").limit(750);
  let locations = ((data || []) as ExploreLocation[]).filter((row) => Boolean(getLocationName(row, "").trim()));

  if (!locations.length) {
    const [restaurantsRes, activitiesRes] = await Promise.all([
      supabaseAdmin.from("restaurants").select("*").limit(350),
      supabaseAdmin.from("activities").select("*").limit(350),
    ]);

    const restaurants = ((restaurantsRes.data || []) as ExploreLocation[]).map((row) => ({ ...row, source_table: "restaurants", type: row.type || "restaurants" }));
    const activities = ((activitiesRes.data || []) as ExploreLocation[]).map((row) => ({ ...row, source_table: "activities", type: row.type || "activities" }));
    locations = [...restaurants, ...activities].filter((row) => Boolean(getLocationName(row, "").trim()));
  }

  const unique = dedupeById(locations);

  return {
    locations: unique,
    rails: buildRails(unique),
    stats: {
      restaurants: unique.filter(isRestaurant).length,
      activities: unique.filter((l) => !isRestaurant(l)).length,
      curated: unique.filter((l) => l.featured).length,
      nyc: unique.filter((l) => [l.city, l.borough, l.neighborhood].filter(Boolean).join(" ").toLowerCase().includes("new york") || (l.city || "").toLowerCase() === "nyc").length,
    },
  };
}

function HeroSection({ data }: { data: Awaited<ReturnType<typeof loadExploreData>> }) {
  const prompts = ["Romantic dinner in Manhattan", "Best rooftop lounge with views", "Group-friendly brunch in Brooklyn"];
  return <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/35 sm:p-10"><h1 className="text-4xl font-black tracking-tight sm:text-6xl">Explore TheOutHaven</h1><p className="mt-4 max-w-3xl text-white/75">Editorial picks and trending spots for restaurants, nightlife, and unforgettable experiences.</p><div className="mt-6 flex flex-wrap gap-3">{prompts.map((prompt) => <Link key={prompt} href={`/create?prompt=${encodeURIComponent(prompt)}`} className="rounded-full border border-white/20 bg-black/30 px-4 py-2 text-xs font-black text-white/85 hover:border-[#e1062a]/60">{prompt}</Link>)}</div><div className="mt-7 flex flex-wrap gap-3"><Link href="/create" className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black">Plan an Outing</Link><Link href="/locations" className="rounded-full border border-white/20 bg-white/[0.04] px-6 py-3 text-sm font-black">Browse All Places</Link></div><div className="mt-7 flex flex-wrap gap-3 text-xs font-black">{[["Restaurants", data.stats.restaurants],["Activities", data.stats.activities],["Curated Picks", data.stats.curated],["NYC Favorites", data.stats.nyc]].map(([label, count]) => <span key={String(label)} className="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-white/80">{label}: {count}</span>)}</div></div>;
}

function CategoryChips() {
  return <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{CHIP_PROMPTS.map((chip) => <Link key={chip} href={`/create?prompt=${encodeURIComponent(chip)}`} className="shrink-0 rounded-full border border-white/20 bg-white/[0.04] px-4 py-2 text-sm font-black hover:border-[#e1062a]/55">{chip}</Link>)}</div>;
}

function EditorialGrid({ locations }: { locations: ExploreLocation[] }) {
  const collections = [
    { key: "romantic", title: "Romantic Date Night", subtitle: "Warm lighting, intimate vibes.", prompt: "Romantic Date Night" , kw: ["romantic", "date night", "intimate"]},
    { key: "dinner-drinks", title: "Dinner Before Drinks", subtitle: "Great food, then elevated cocktails.", prompt: "Dinner Before Drinks", kw: ["dinner", "cocktail", "lounge"]},
    { key: "brunch", title: "Weekend Brunch", subtitle: "Lively daytime plans with style.", prompt: "Weekend Brunch", kw: ["brunch", "bottomless", "breakfast"]},
    { key: "group", title: "Group Celebration", subtitle: "Big energy for birthdays and milestones.", prompt: "Group Celebration", kw: ["group", "birthday", "karaoke", "arcade"]},
  ];
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{collections.map((c) => {
    const primary = filterAndRank(locations, c.kw)[0] || rankLocations(locations)[0];
    if (!primary) return null;
    return <article key={c.key} className="group relative min-h-[330px] overflow-hidden rounded-[1.7rem] border border-white/10"><img src={getLocationImage(primary)} alt={getLocationName(primary)} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-[#070303] via-[#070303]/70 to-transparent" /><div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,0.32),transparent_42%)]" /><div className="relative flex h-full flex-col justify-end p-5"><p className="text-xs font-black uppercase tracking-[0.22em] text-white/70">Editorial</p><h3 className="mt-2 text-2xl font-black">{c.title}</h3><p className="mt-1 text-sm text-white/75">{c.subtitle}</p><p className="mt-2 text-xs text-white/75">Featuring {getLocationName(primary)} · {getArea(primary)}</p><div className="mt-4"><Link href={`/create?prompt=${encodeURIComponent(c.prompt)}`} className="rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black">Plan This</Link></div></div></article>;
  })}</div>;
}

function ExploreRails({ rails }: { rails: Array<{ title: string; items: ExploreLocation[] }> }) {
  return <div className="space-y-8">{rails.map((rail) => rail.items.length ? <section key={rail.title}><div className="mb-4 flex items-end justify-between gap-3"><h2 className="text-2xl font-black">{rail.title}</h2><Link href="/create" className="text-xs font-black text-red-200">Plan Outing →</Link></div><div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{rail.items.map((location) => <LocationCard key={`${rail.title}-${location.id}`} location={location} />)}</div></section> : null)}</div>;
}

function LocationCard({ location }: { location: ExploreLocation }) {
  const rating = location.rating || location.score;
  const reserveHref = location.external_reservation_url || location.reservation_url || location.website;
  const detailHref = getLocationDetailHref({ id: location.id, type: location.type || location.source_table });
  const chips = getCleanChips(location);

  return <article className="group flex min-h-[350px] w-[292px] shrink-0 flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-3"><div className="relative h-44 overflow-hidden rounded-2xl"><img src={getLocationImage(location)} alt={getLocationName(location)} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /><div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" /></div><div className="mt-3 flex flex-1 flex-col"><h3 className="line-clamp-2 min-h-[3.5rem] text-lg font-black">{getLocationName(location)}</h3><p className="line-clamp-1 text-sm text-white/70">{getPrimaryCategory(location)} · {getArea(location)}</p><p className="line-clamp-1 text-xs text-white/65">{[getCuisine(location) || location.activity_type, rating ? `${rating.toFixed(1)} ★` : null].filter(Boolean).join(" · ") || "Curated on TheOutHaven"}</p><div className="mt-3 min-h-[2.6rem] flex flex-wrap gap-2">{chips.map((chip) => <span key={`${location.id}-${chip}`} className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] font-black text-white/80">{chip}</span>)}</div><div className="mt-auto flex gap-2 pt-4"><Link href={detailHref} className="rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black">View</Link>{reserveHref ? <a href={reserveHref} target="_blank" rel="noreferrer" className="rounded-full border border-white/20 bg-white/[0.05] px-4 py-2 text-xs font-black">Reserve</a> : null}</div></div></article>;
}

function getArea(location: ExploreLocation) { return location.neighborhood || location.borough || location.city || "New York"; }
function dedupeById(locations: ExploreLocation[]) { const seen = new Set<string>(); return locations.filter((l) => l.id && !seen.has(l.id) && seen.add(l.id)); }
function isRestaurant(location: ExploreLocation) { return searchableText(location).includes("restaurant") || String(location.source_table || "").toLowerCase() === "restaurants" || Boolean(location.restaurant_name); }
function searchableText(location: ExploreLocation) { return [location.source_table, location.type, location.name, location.restaurant_name, location.activity_name, location.business_name, location.city, location.borough, location.neighborhood, location.category, location.primary_category, location.cuisine, location.cuisine_type, location.activity_type, ...toList(location.tags), ...toList(location.vibes), ...toList(location.atmosphere), ...toList(location.best_for), ...toList(location.date_style_tags), ...toList(location.search_keywords)].filter(Boolean).join(" ").toLowerCase(); }
function toList(v: unknown): string[] { if (!v) return []; if (Array.isArray(v)) return v.map((x) => String(x)); if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean); return [String(v)]; }
function score(location: ExploreLocation) { return (location.rating || location.score || 0) * 35 + (location.total_reviews || 0) * 1.5 + (location.views_count || 0) * 0.05 + (location.saves_count || 0) * 0.7 + (location.reservation_count || 0) * 1.2 + (location.featured ? 30 : 0); }
function rankLocations(locations: ExploreLocation[]) { return [...locations].sort((a, b) => score(b) - score(a)); }
function filterAndRank(locations: ExploreLocation[], keywords: string[], options?: { restaurantOnly?: boolean }) { return rankLocations(locations.filter((l) => (!options?.restaurantOnly || isRestaurant(l)) && keywords.some((k) => searchableText(l).includes(k.toLowerCase())))); }
function uniq(items: ExploreLocation[]) { return dedupeById(items); }
function take(items: ExploreLocation[], n: number) { return uniq(items).slice(0, n); }

function buildRails(locations: ExploreLocation[]) {
  const rails = [
    { title: "Trending Restaurants", items: take(rankLocations(locations.filter(isRestaurant)), 8) },
    { title: "Trending Activities", items: take(rankLocations(locations.filter((l) => !isRestaurant(l))), 8) },
    { title: "Date Night Picks", items: take(filterAndRank(locations, ["date night", "romantic", "intimate", "cocktail"]), 8) },
    { title: "Dinner Spots", items: take(filterAndRank(locations, ["dinner", "steak", "fine dining", "tasting"], { restaurantOnly: true }), 8) },
    { title: "Lounges & Nightlife", items: take(filterAndRank(locations, ["lounge", "nightlife", "club", "bar", "hookah"]), 8) },
    { title: "Rooftops & Views", items: take(filterAndRank(locations, ["rooftop", "terrace", "skyline", "view"]), 8) },
    { title: "Brunch Favorites", items: take(filterAndRank(locations, ["brunch", "breakfast", "bottomless"], { restaurantOnly: true }), 8) },
    { title: "Dessert Spots", items: take(filterAndRank(locations, ["dessert", "bakery", "ice cream", "patisserie"], { restaurantOnly: true }), 8) },
    { title: "Group-Friendly Experiences", items: take(filterAndRank(locations, ["group", "birthday", "celebration", "bowling", "karaoke", "arcade", "vr", "private"]), 8) },
    { title: "New & Noteworthy", items: take(rankLocations([...locations].sort((a, b) => (Date.parse(b.created_at || "0") || 0) - (Date.parse(a.created_at || "0") || 0))), 8) },
  ];
  return rails.filter((r) => r.items.length);
}

function labelize(value: string): string {
  const cleaned = value.trim().replace(/^"|"$/g, "");
  const lower = cleaned.toLowerCase();
  const map: Record<string, string> = { "theouthaven-friendly outing": "TheOutHaven Pick", "date-night": "Date Night", "group-outing": "Group Outing", "group-outings": "Group Outing" };
  if (map[lower]) return map[lower];
  return cleaned.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getCleanChips(location: ExploreLocation): string[] {
  const candidates = [location.primary_category, location.category, location.cuisine, location.cuisine_type, location.activity_type, ...toList(location.tags), ...toList(location.vibes)];
  const out: string[] = [];
  for (const raw of candidates) {
    const text = String(raw || "").trim();
    if (!text || ["[]", "{}", "null", "undefined"].includes(text.toLowerCase())) continue;
    if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) continue;
    const label = labelize(text);
    if (!label) continue;
    if (!out.some((i) => i.toLowerCase() === label.toLowerCase())) out.push(label);
    if (out.length >= 3) break;
  }
  return out;
}

function EmptyState() {
  return <div className="rounded-[2rem] border border-dashed border-white/20 bg-white/[0.03] p-9 text-center"><h2 className="text-3xl font-black">Your Explore page is warming up.</h2><p className="mx-auto mt-3 max-w-2xl text-sm text-white/70">We need location records to be imported or synced before Explore can publish premium editorial rails and collections.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link href="/admin" className="rounded-full border border-white/20 bg-white/[0.04] px-6 py-3 text-sm font-black">Open Admin</Link><Link href="/create" className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black">Plan an Outing</Link></div></div>;
}

function PublicFooter() { const links = [["Home","/"],["Explore","/explore"],["Create Outing","/create"],["Business","/business"],["Sign In","/signup"],["Terms","/terms"],["Privacy","/privacy"],["SMS Terms","/sms-terms"],["Contact","/contact"]] as const; return <footer className="mt-12 border-t border-white/10 bg-black/50 px-5 py-10 sm:px-6"><div className="mx-auto max-w-7xl"><div className="flex flex-wrap gap-4 text-sm text-white/70">{links.map(([label,href])=><Link key={label} href={href} className="hover:text-white">{label}</Link>)}</div><div className="mt-5 flex gap-3 text-white/55"><span>◎</span><span>◉</span><span>◌</span></div><p className="mt-4 text-xs text-white/45">© {new Date().getFullYear()} TheOutHaven. All rights reserved.</p></div></footer>; }
