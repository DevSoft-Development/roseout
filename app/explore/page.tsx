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
  location_type: string | null;
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
  is_searchable: boolean | null;
  is_hidden: boolean | null;
  data_status: string | null;
};

const BOROUGHS = ["All", "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"] as const;

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ borough?: string; kind?: string; category?: string }> }) {
  const params = await searchParams;
  const selectedBorough = BOROUGHS.find((b) => b.toLowerCase() === String(params.borough || "").toLowerCase()) || "All";
  const selectedKind = ["all", "restaurant", "activity"].includes(String(params.kind || "all").toLowerCase()) ? String(params.kind || "all").toLowerCase() : "all";
  const data = await loadExploreData();
  const categoryOptions = buildCategoryOptions(data.locations);
  const selectedCategory = categoryOptions.find((c) => c.toLowerCase() === String(params.category || "").toLowerCase()) || "All";

  const filtered = data.locations.filter((l) => {
    const boroughOk = selectedBorough === "All" || String(l.borough || "").toLowerCase() === selectedBorough.toLowerCase();
    const kindOk = selectedKind === "all" || (selectedKind === "restaurant" ? isRestaurant(l) : !isRestaurant(l));
    const categoryOk = selectedCategory === "All" || searchableText(l).includes(selectedCategory.toLowerCase());
    return boroughOk && kindOk && categoryOk;
  });

  const sections = buildSections(filtered);

  return <main className="min-h-screen overflow-x-hidden bg-[#070303] text-white"><TheOutHavenHeader /><section className="relative overflow-hidden px-5 pb-16 pt-32 sm:px-6 lg:pt-40"><div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(225,6,42,0.28),transparent_36%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,.1),transparent_24%),linear-gradient(150deg,#080303_0%,#160807_50%,#080303_100%)]" /><div className="mx-auto max-w-7xl space-y-8"><HeroSearch /><FilterRow selectedBorough={selectedBorough} selectedKind={selectedKind} selectedCategory={selectedCategory} categoryOptions={categoryOptions} />{sections.map((s) => <SectionRow key={s.title} title={s.title} items={s.items} />)}</div></section><PublicFooter /></main>;
}

async function loadExploreData() {
  const { data } = await supabaseAdmin.from("locations").select("*").eq("is_searchable", true).neq("is_hidden", true).eq("data_status", "clean").limit(1200);
  return { locations: dedupeById((data || []) as ExploreLocation[]).filter((row) => Boolean(getLocationName(row, "").trim())) };
}

function HeroSearch() {
  return <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/35 sm:p-10"><h1 className="text-4xl font-black tracking-tight sm:text-6xl">Explore TheOutHaven</h1><p className="mt-4 max-w-3xl text-white/75">Search NYC restaurants and activities with live location data.</p><form action="/create" method="get" className="mt-6 flex flex-col gap-3 sm:flex-row"><input type="text" name="prompt" placeholder="Search by vibe, cuisine, borough, or activity" className="w-full rounded-full border border-white/20 bg-black/35 px-5 py-3 text-sm outline-none focus:border-[#e1062a]" /><button type="submit" className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black">Search</button></form></div>;
}

function FilterRow({ selectedBorough, selectedKind, selectedCategory, categoryOptions }: { selectedBorough: string; selectedKind: string; selectedCategory: string; categoryOptions: string[] }) {
  return <div className="space-y-3"><ChipList title="Borough" options={BOROUGHS} selected={selectedBorough} keyName="borough" /><ChipList title="Type" options={["all", "restaurant", "activity"]} selected={selectedKind} keyName="kind" /><ChipList title="Category" options={categoryOptions} selected={selectedCategory} keyName="category" /></div>;
}

function ChipList({ title, options, selected, keyName }: { title: string; options: readonly string[]; selected: string; keyName: string }) {
  return <div><p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-white/60">{title}</p><div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{options.map((opt) => <Link key={opt} href={buildHref(keyName, opt)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-black ${String(opt).toLowerCase() === selected.toLowerCase() ? "border-[#e1062a] bg-[#e1062a]/25" : "border-white/20 bg-white/[0.04]"}`}>{opt}</Link>)}</div></div>;
}

function SectionRow({ title, items }: { title: string; items: ExploreLocation[] }) {
  if (!items.length) return null;
  return <section><h2 className="mb-4 text-2xl font-black">{title}</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{items.slice(0, 4).map((location) => <LocationCard key={`${title}-${location.id}`} location={location} />)}</div></section>;
}

function LocationCard({ location }: { location: ExploreLocation }) { const rating = location.rating || location.score; const reserveHref = location.external_reservation_url || location.reservation_url || location.website; const detailHref = getLocationDetailHref({ id: location.id, type: location.type || location.source_table }); return <article className="group flex min-h-[350px] flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-3"><div className="relative h-44 overflow-hidden rounded-2xl"><img src={getLocationImage(location)} alt={getLocationName(location)} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></div><div className="mt-3 flex flex-1 flex-col"><h3 className="line-clamp-2 min-h-[3.5rem] text-lg font-black">{getLocationName(location)}</h3><p className="line-clamp-1 text-sm text-white/70">{getPrimaryCategory(location)} · {location.borough || location.city || "New York"}</p><p className="line-clamp-1 text-xs text-white/65">{[getCuisine(location) || location.activity_type, rating ? `${rating.toFixed(1)} ★` : null].filter(Boolean).join(" · ") || "Curated on TheOutHaven"}</p><div className="mt-auto flex gap-2 pt-4"><Link href={detailHref} className="rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black">View</Link>{reserveHref ? <a href={reserveHref} target="_blank" rel="noreferrer" className="rounded-full border border-white/20 bg-white/[0.05] px-4 py-2 text-xs font-black">Reserve</a> : null}</div></div></article>; }

function buildSections(locations: ExploreLocation[]) {
  const used = new Set<string>();
  const alloc = (candidates: ExploreLocation[]) => candidates.filter((l) => !used.has(l.id)).slice(0, 4).map((l) => (used.add(l.id), l));
  const ranked = rankLocations(locations);
  return [
    { title: "Popular near you", items: alloc(ranked) },
    { title: "Date night picks", items: alloc(filterAndRank(locations, ["date night", "romantic", "intimate", "cocktail"])) },
    { title: "Weekend brunch", items: alloc(filterAndRank(locations, ["brunch", "breakfast", "cafe", "bottomless", "restaurant"], { restaurantOnly: true })) },
    { title: "Romantic restaurants", items: alloc(filterAndRank(locations, ["romantic", "intimate", "fine dining"], { restaurantOnly: true })) },
    { title: "Hookah lounges", items: alloc(filterAndRank(locations, ["hookah", "lounge", "shisha", "nightlife"], { activityOnly: true })) },
    { title: "Birthday dinner spots", items: alloc(filterAndRank(locations, ["birthday", "celebration", "dinner", "group"], { restaurantOnly: true })) },
    { title: "Activities after dinner", items: alloc(filterAndRank(locations, ["activity", "arcade", "karaoke", "bowling", "lounge", "bar"], { activityOnly: true })) },
    { title: "Newly added locations", items: alloc([...locations].sort((a, b) => (Date.parse(b.created_at || "0") || 0) - (Date.parse(a.created_at || "0") || 0))) },
  ].filter((s) => s.items.length);
}

function dedupeById(locations: ExploreLocation[]) { const seen = new Set<string>(); return locations.filter((l) => l.id && !seen.has(l.id) && seen.add(l.id)); }
function isRestaurant(location: ExploreLocation) { return String(location.location_type || location.type || location.source_table || "").toLowerCase().includes("restaurant") || searchableText(location).includes("restaurant") || Boolean(location.restaurant_name); }
function searchableText(location: ExploreLocation) { return [location.source_table, location.type, location.location_type, location.name, location.restaurant_name, location.activity_name, location.business_name, location.city, location.borough, location.neighborhood, location.category, location.primary_category, location.cuisine, location.cuisine_type, location.activity_type, ...toList(location.tags), ...toList(location.vibes), ...toList(location.atmosphere), ...toList(location.best_for), ...toList(location.date_style_tags), ...toList(location.search_keywords)].filter(Boolean).join(" ").toLowerCase(); }
function toList(v: unknown): string[] { if (!v) return []; if (Array.isArray(v)) return v.map((x) => String(x)); if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean); return [String(v)]; }
function score(location: ExploreLocation) { return (location.rating || location.score || 0) * 35 + (location.total_reviews || 0) * 1.5 + (location.views_count || 0) * 0.05 + (location.saves_count || 0) * 0.7 + (location.reservation_count || 0) * 1.2 + (location.featured ? 30 : 0); }
function rankLocations(locations: ExploreLocation[]) { return [...locations].sort((a, b) => score(b) - score(a)); }
function filterAndRank(locations: ExploreLocation[], keywords: string[], options?: { restaurantOnly?: boolean; activityOnly?: boolean }) { return rankLocations(locations.filter((l) => (!options?.restaurantOnly || isRestaurant(l)) && (!options?.activityOnly || !isRestaurant(l)) && keywords.some((k) => searchableText(l).includes(k.toLowerCase())))); }
function buildCategoryOptions(locations: ExploreLocation[]) { const vals = new Set<string>(); for (const l of locations) { [l.primary_category, l.category, l.cuisine, l.activity_type].forEach((v) => { const t = String(v || "").trim(); if (t) vals.add(t); }); } return ["All", ...Array.from(vals).sort((a, b) => a.localeCompare(b)).slice(0, 16)] as string[]; }
function buildHref(keyName: string, value: string) { return `/explore?${keyName}=${encodeURIComponent(value)}`; }

function PublicFooter() { const links = [["Home","/"],["Explore","/explore"],["Create Outing","/create"],["Business","/business"],["Sign In","/signup"],["Terms","/terms"],["Privacy","/privacy"],["SMS Terms","/sms-terms"],["Contact","/contact"]] as const; return <footer className="mt-12 border-t border-white/10 bg-black/50 px-5 py-10 sm:px-6"><div className="mx-auto max-w-7xl"><div className="flex flex-wrap gap-4 text-sm text-white/70">{links.map(([label,href])=><Link key={label} href={href} className="hover:text-white">{label}</Link>)}</div></div></footer>; }
