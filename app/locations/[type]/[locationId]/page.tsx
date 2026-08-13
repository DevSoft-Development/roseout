"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import LocationHours from "@/components/public-location/LocationHours";
import LocationImagePlaceholder from "@/components/public-location/LocationImagePlaceholder";
import SafeLocationImage from "@/components/public-location/SafeLocationImage";
import { clampScore } from "@/lib/clampScore";
import { buildGoogleMapsSearchUrl, getGoogleMapsUrl } from "@/lib/googleDirections";
import { getLocationTags, getPrimaryCategory } from "@/lib/locationFields";
import { getOperatingHours } from "@/lib/locationHours";
import { getLocationName } from "@/lib/locationName";
import { getLocationScore } from "@/lib/locationScore";
import { isPublicSearchVisible } from "@/lib/locationVisibility";
import { getPhotoList, getPrimaryPhoto } from "@/lib/publicLocationPhotos";
import {
  getExternalReservationProvider,
  getExternalReservationUrl,
  getInternalReservationHref,
  getReservationSourceLabel,
} from "@/lib/reservation";
import { createClient } from "@/lib/supabase-browser";
import { trackActivity } from "@/lib/trackActivity";

type LocationRecord = Record<string, unknown> & {
  id?: string | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  business_name?: string | null;
  primary_category?: string | null;
  cuisine_type?: string | null;
  location_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  neighborhood?: string | null;
  price_range?: string | null;
  description?: string | null;
  website?: string | null;
  phone?: string | null;
  reservation_enabled?: boolean | null;
  review_count?: number | string | null;
  review_score?: number | string | null;
  cuisine?: string | null;
  activity_type?: string | null;
  atmosphere?: string | null;
};

type ReviewRecord = Record<string, unknown> & {
  id?: string | number | null;
  customer_name?: string | null;
  rating?: number | string | null;
  review_text?: string | null;
};

type MenuSection = Record<string, unknown> & {
  id?: string | number | null;
  title?: string | null;
  name?: string | null;
  description?: string | null;
};

type MenuItem = Record<string, unknown> & {
  id?: string | number | null;
  section_id?: string | number | null;
  name?: string | null;
  description?: string | null;
  price_label?: string | null;
  price?: string | number | null;
  price_cents?: number | null;
  image_url?: string | null;
  is_featured?: boolean | null;
  is_available?: boolean | null;
};

type MenuPayload = {
  page?: { title?: string | null; description?: string | null } | null;
  sections?: MenuSection[];
  items?: MenuItem[];
};

type PublicMenuResponse = { ok?: boolean; data?: MenuPayload };
type TabId = "overview" | "menu" | "photos" | "reviews" | "info";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "menu", label: "Menu" },
  { id: "photos", label: "Photos" },
  { id: "reviews", label: "Reviews" },
  { id: "info", label: "Info" },
];

function toArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(toArray).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  const text = value.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.flatMap(toArray).map((item) => item.trim()).filter(Boolean);
  } catch {
    // Plain text is handled below.
  }
  return text.replace(/^\[|\]$/g, "").split(",").map((item) => item.trim().replace(/^["']|["']$/g, "").replace(/[-_]+/g, " ")).filter(Boolean);
}

function titleCase(value: unknown) {
  const text = String(value || "").trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  return text.split(" ").filter(Boolean).map((word) => word.length <= 2 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

function displayAddress(location: LocationRecord | null) {
  return [location?.address, location?.city, location?.state, location?.zip_code].map((item) => String(item || "").trim()).filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).join(", ");
}

function displayArea(location: LocationRecord | null) {
  return [location?.neighborhood, location?.city, location?.state].map((item) => String(item || "").trim()).filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).slice(0, 2).join(", ");
}

function websiteHref(location: LocationRecord | null) {
  const value = String(location?.website || "").trim();
  return value ? (/^https?:\/\//i.test(value) ? value : `https://${value}`) : "";
}

function phoneHref(location: LocationRecord | null) {
  const value = String(location?.phone || "").replace(/[^\d+]/g, "");
  return value ? `tel:${value}` : "";
}

function menuPrice(item: MenuItem) {
  if (item.price_label) return String(item.price_label);
  if (item.price !== null && item.price !== undefined && item.price !== "") {
    const value = String(item.price);
    return value.startsWith("$") ? value : `$${value}`;
  }
  return typeof item.price_cents === "number" ? `$${(item.price_cents / 100).toFixed(2)}` : "";
}

export default function LocationDetailPage() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = String(params.type || "");
  const locationId = String(params.locationId || "");
  const from = searchParams.get("from") || "/create";

  const [location, setLocation] = useState<LocationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [menu, setMenu] = useState<MenuPayload | null>(null);
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [menuLoading, setMenuLoading] = useState(false);
  const [shareLabel, setShareLabel] = useState("Share");

  useEffect(() => {
    let cancelled = false;
    async function loadLocation() {
      setLoading(true);
      const sourceTables = type === "activities" || type === "activity" ? ["activities", "activity"] : ["restaurants", "restaurant"];
      const sourceOr = sourceTables.map((sourceTable) => `and(source_table.eq.${sourceTable},source_id.eq.${locationId})`).join(",");
      let { data, error } = await supabase.from("locations").select("*").or(`id.eq.${locationId},${sourceOr}`).maybeSingle();
      if (!data && !error) {
        const slugResult = await supabase.from("locations").select("*").eq("slug", locationId).maybeSingle();
        if (!slugResult.error) data = slugResult.data;
      }

      const demoPreview = searchParams.get("demo") === "1" && searchParams.get("fromDemoCenter") === "1" && (searchParams.get("adminLocationId") === String(data?.id || locationId) || searchParams.get("locationId") === String(data?.id || locationId));
      const demoTagged = (data as Record<string, unknown> | null)?.demo_key === "real_location_mirror_demo" || (data as { metadata?: { demo_key?: string } } | null)?.metadata?.demo_key === "real_location_mirror_demo";
      if (error || !data || (!isPublicSearchVisible(data) && !(demoPreview && demoTagged))) {
        if (!cancelled) { setLocation(null); setLoading(false); }
        return;
      }
      if (!cancelled) { setLocation(data); setLoading(false); }
    }
    if (locationId) void loadLocation();
    return () => { cancelled = true; };
  }, [locationId, searchParams, supabase, type]);

  useEffect(() => {
    if (!location?.id) return;
    fetch("/api/analytics/location-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ location_id: location.id, event_type: "profile_view", event_source: "profile", metadata: { location_type: location.location_type || type, location_name: getLocationName(location) } }),
    }).catch(() => undefined);
  }, [location?.id, location?.location_type, type]);

  useEffect(() => {
    if (activeTab !== "reviews" || reviewsLoaded || !location?.id) return;
    let cancelled = false;
    setReviewsLoading(true);
    supabase.from("location_reviews").select("*").eq("location_id", location.id).eq("status", "approved").eq("verified_visit", true).order("created_at", { ascending: false }).then(({ data }) => {
      if (!cancelled) { setReviews((data || []) as ReviewRecord[]); setReviewsLoaded(true); setReviewsLoading(false); }
    });
    return () => { cancelled = true; };
  }, [activeTab, location?.id, reviewsLoaded, supabase]);

  useEffect(() => {
    if (activeTab !== "menu" || menuLoaded || !location?.id) return;
    let cancelled = false;
    setMenuLoading(true);
    fetch(`/api/public/menu?locationId=${encodeURIComponent(String(location.id))}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Menu unavailable")))
      .then((response: PublicMenuResponse) => {
        if (!cancelled) { setMenu(response.data || null); setMenuLoaded(true); setMenuLoading(false); }
      })
      .catch(() => {
        if (!cancelled) { setMenu(null); setMenuLoaded(true); setMenuLoading(false); }
      });
    return () => { cancelled = true; };
  }, [activeTab, location?.id, menuLoaded]);

  const isActivity = location?.location_type === "activity" || type === "activities" || type === "activity";
  const name = getLocationName(location, "TheOutHaven Location");
  const category = getPrimaryCategory(location);
  const score = clampScore(getLocationScore(location));
  const area = displayArea(location);
  const address = displayAddress(location);
  const photos = getPhotoList(location).slice(0, 12);
  const heroPhoto = getPrimaryPhoto(location) || photos[0] || "";
  const website = websiteHref(location);
  const phone = phoneHref(location);
  const mapsUrl = useMemo(() => getGoogleMapsUrl(location) || buildGoogleMapsSearchUrl(location), [location]);
  const tags = Array.from(new Set([...toArray(getLocationTags(location)), ...toArray(location?.atmosphere), ...toArray(location?.best_for), ...toArray(location?.special_features)].map(titleCase).filter(Boolean))).slice(0, 6);
  const reviewCount = Number(location?.review_count || reviews.length || 0);
  const reviewScore = Number(location?.review_score || 0);

  const externalReservationUrl = getExternalReservationUrl(location || {});
  const externalReservationProvider = getExternalReservationProvider(location || {});
  const internalReservationHref = getInternalReservationHref(location || {}, isActivity ? "activity" : "restaurant");
  const reservationSource = String(location?.reservation_source || "external").toLowerCase();
  const internalEnabled = Boolean(location?.internal_reservations_enabled || location?.uses_internal_reservations || location?.reservation_enabled === true);
  const canUseInternal = (reservationSource === "internal" || reservationSource === "both") && internalEnabled && Boolean(internalReservationHref);
  const canUseExternal = (reservationSource === "external" || reservationSource === "both") && Boolean(externalReservationUrl);
  const reservationHref = canUseInternal ? String(internalReservationHref) : canUseExternal ? String(externalReservationUrl) : "";
  const reservationLabel = canUseInternal ? (isActivity ? "Book on TheOutHaven" : "Find a Table") : canUseExternal ? (externalReservationProvider ? `Reserve via ${externalReservationProvider}` : "Reserve") : "";
  const reservationSourceLabel = getReservationSourceLabel(location || {});
  const planHref = `/create?locationId=${encodeURIComponent(String(location?.id || locationId))}&locationType=${encodeURIComponent(isActivity ? "activity" : "restaurant")}`;

  function trackBusinessEvent(eventType: "reservation_started" | "website_click" | "directions_click") {
    if (!location?.id) return;
    fetch("/api/analytics/location-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ location_id: location.id, event_type: eventType, event_source: "profile", metadata: { location_id: locationId, location_type: location.location_type || type, location_name: name } }),
    }).catch(() => undefined);
  }

  function goBack() {
    trackActivity({ eventType: "navigation", eventName: "Back To Results", pagePath: window.location.pathname, metadata: { location_id: locationId, location_type: location?.location_type || type, source: "location_detail_page" } });
    if (window.history.length > 1) router.back(); else router.push(from);
  }

  async function shareLocation() {
    try {
      if (navigator.share) await navigator.share({ title: name, text: `Check out ${name} on TheOutHaven`, url: window.location.href });
      else { await navigator.clipboard.writeText(window.location.href); setShareLabel("Copied"); window.setTimeout(() => setShareLabel("Share"), 1800); }
    } catch { /* Native share cancelled. */ }
  }

  if (loading) return <LocationLoading />;
  if (!location) return <LocationMissing onBack={() => router.push(from)} />;

  return (
    <>
      <TheOutHavenHeader />
      <main className="min-h-screen bg-[var(--toh-black)] pb-28 pt-20 text-white md:pb-12">
        <section className="relative isolate min-h-[520px] overflow-hidden border-b border-white/10 sm:min-h-[590px]">
          <div className="absolute inset-0">
            {heroPhoto ? <SafeLocationImage src={heroPhoto} alt={name} priority className="object-cover" /> : <LocationImagePlaceholder label="Photo coming soon" />}
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,5,.98)_0%,rgba(5,5,5,.9)_38%,rgba(5,5,5,.3)_76%,rgba(5,5,5,.14)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(0deg,#050505_0%,transparent_50%)]" />
          </div>
          <div className="toh-container relative z-10 flex min-h-[520px] items-end pb-10 pt-20 sm:min-h-[590px] sm:pb-14">
            <div className="max-w-2xl">
              <button onClick={goBack} className="mb-7 min-h-11 rounded-full border border-white/15 bg-black/45 px-4 text-sm font-extrabold text-white/80 backdrop-blur-md hover:text-white">← Back to results</button>
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-[rgba(225,6,42,.5)] bg-[rgba(225,6,42,.15)] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-red-100">{category || (isActivity ? "Activity" : "Restaurant")}</span>
                {area ? <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs font-bold text-white/75">{area}</span> : null}
              </div>
              <h1 className="text-4xl font-black tracking-[-0.035em] text-white sm:text-6xl lg:text-7xl">{name}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-bold text-white/75 sm:text-base">
                {reviewScore > 0 ? <span><span className="text-[var(--toh-red)]">★</span> {reviewScore.toFixed(1)}{reviewCount ? ` (${reviewCount} reviews)` : ""}</span> : null}
                {location.price_range ? <><span className="text-white/30">•</span><span>{String(location.price_range)}</span></> : null}
                {category ? <><span className="text-white/30">•</span><span>{category}</span></> : null}
              </div>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/75 sm:text-lg">{location.description || "A curated TheOutHaven pick for memorable outings, quality experiences, and easy planning."}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href={planHref} className="toh-btn inline-flex min-h-12 items-center justify-center px-6 py-3 text-sm">Plan an Outing</Link>
                <button onClick={() => void shareLocation()} className="toh-btn-outline min-h-12 bg-black/35 px-5 py-3 text-sm backdrop-blur-md">{shareLabel}</button>
                {reservationHref ? <a href={reservationHref} target={canUseInternal ? undefined : "_blank"} rel={canUseInternal ? undefined : "noopener noreferrer"} onClick={() => trackBusinessEvent("reservation_started")} className="toh-btn-outline inline-flex min-h-12 items-center justify-center bg-black/35 px-5 py-3 text-sm backdrop-blur-md">{reservationLabel}</a> : null}
              </div>
            </div>
          </div>
        </section>

        <section className="sticky top-20 z-30 border-b border-white/10 bg-[#050505]/95 backdrop-blur-xl">
          <div className="toh-container flex items-center gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Location details">
            {TABS.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-black transition ${activeTab === tab.id ? "bg-[var(--toh-red)] text-white" : "text-white/60 hover:bg-white/[0.06] hover:text-white"}`}>{tab.label}</button>)}
          </div>
        </section>

        <div className="toh-container py-8 sm:py-10">
          {activeTab === "overview" ? <OverviewTab location={location} tags={tags} category={category} area={area} address={address} score={score} reservationHref={reservationHref} reservationLabel={reservationLabel} reservationSourceLabel={reservationSourceLabel} canUseInternal={canUseInternal} onReserve={() => trackBusinessEvent("reservation_started")} onTabChange={setActiveTab} photoCount={photos.length} reviewCount={reviewCount} /> : null}
          {activeTab === "menu" ? <MenuTab menu={menu} loading={menuLoading} /> : null}
          {activeTab === "photos" ? <PhotosTab photos={photos} heroPhoto={heroPhoto} name={name} /> : null}
          {activeTab === "reviews" ? <ReviewsTab reviews={reviews} loading={reviewsLoading} reviewCount={reviewCount} reviewScore={reviewScore} /> : null}
          {activeTab === "info" ? <InfoTab location={location} address={address} website={website} phone={phone} mapsUrl={mapsUrl} onWebsite={() => trackBusinessEvent("website_click")} onDirections={() => trackBusinessEvent("directions_click")} /> : null}
        </div>
      </main>

      {reservationHref ? <div className="toh-mobile-sticky fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#050505]/96 p-3 backdrop-blur-xl md:hidden"><a href={reservationHref} target={canUseInternal ? undefined : "_blank"} rel={canUseInternal ? undefined : "noopener noreferrer"} onClick={() => trackBusinessEvent("reservation_started")} className="toh-btn flex min-h-12 w-full items-center justify-center px-5 text-sm">{reservationLabel}</a></div> : null}
    </>
  );
}

function OverviewTab({ location, tags, category, area, address, score, reservationHref, reservationLabel, reservationSourceLabel, canUseInternal, onReserve, onTabChange, photoCount, reviewCount }: { location: LocationRecord; tags: string[]; category: string; area: string; address: string; score: number; reservationHref: string; reservationLabel: string; reservationSourceLabel: string | null; canUseInternal: boolean; onReserve: () => void; onTabChange: (tab: TabId) => void; photoCount: number; reviewCount: number }) {
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
    <div className="space-y-6">
      <section className="rounded-[1.6rem] border border-white/10 bg-[var(--toh-panel)] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">About</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">Know before you go</h2><p className="mt-4 max-w-3xl text-sm leading-7 text-white/68 sm:text-base">{location.description || `A TheOutHaven-curated ${category || "spot"}${area ? ` in ${area}` : ""}, selected for a strong outing experience.`}</p>{tags.length ? <div className="mt-5 flex flex-wrap gap-2">{tags.map((tag) => <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/70">{tag}</span>)}</div> : null}</section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><QuickStat label="Location" value={area || address || "See info"} /><QuickStat label="Category" value={category || "Local spot"} /><QuickStat label="TheOutHaven Match" value={`${score}%`} accent /><QuickStat label="Community" value={reviewCount ? `${reviewCount} reviews` : "New on TheOutHaven"} /></section>
      <section className="rounded-[1.6rem] border border-white/10 bg-[var(--toh-panel)] p-6 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Explore this place</p><h2 className="mt-2 text-2xl font-black">Details without the clutter</h2></div><div className="flex flex-wrap gap-2">{photoCount ? <button onClick={() => onTabChange("photos")} className="toh-btn-outline px-4 py-2 text-sm">{photoCount} Photos</button> : null}<button onClick={() => onTabChange("reviews")} className="toh-btn-outline px-4 py-2 text-sm">Reviews</button><button onClick={() => onTabChange("info")} className="toh-btn-outline px-4 py-2 text-sm">Hours & Info</button></div></div></section>
    </div>
    <aside className="rounded-[1.6rem] border border-white/10 bg-[var(--toh-panel)] p-6 lg:sticky lg:top-40"><p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Plan your visit</p><h2 className="mt-2 text-2xl font-black">Ready when you are.</h2><p className="mt-3 text-sm leading-6 text-white/60">Check availability, make a reservation, or add this location to a complete outing.</p>{reservationSourceLabel ? <p className="mt-4 text-xs font-bold text-white/45">{reservationSourceLabel}</p> : null}{reservationHref ? <a href={reservationHref} target={canUseInternal ? undefined : "_blank"} rel={canUseInternal ? undefined : "noopener noreferrer"} onClick={onReserve} className="toh-btn mt-5 flex min-h-12 w-full items-center justify-center px-5 text-sm">{reservationLabel}</a> : <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/55">Online reservations are not listed for this location yet.</p>}</aside>
  </div>;
}

function MenuTab({ menu, loading }: { menu: MenuPayload | null; loading: boolean }) {
  if (loading) return <TabLoading label="Loading menu…" />;
  const sections = menu?.sections || [];
  const items = menu?.items || [];
  if (!menu?.page || !sections.length) return <EmptyTab title="Menu is not available yet." description="This location has not published a menu on TheOutHaven yet." />;
  return <div className="mx-auto max-w-5xl space-y-6"><header className="mb-8"><p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Menu</p><h2 className="mt-2 text-3xl font-black sm:text-4xl">{menu.page.title || "Menu"}</h2>{menu.page.description ? <p className="mt-3 max-w-2xl text-sm leading-7 text-white/60">{menu.page.description}</p> : null}</header>{sections.map((section) => { const sectionItems = items.filter((item) => String(item.section_id || "") === String(section.id || "")); if (!sectionItems.length) return null; return <section key={String(section.id)} className="rounded-[1.6rem] border border-white/10 bg-[var(--toh-panel)] p-5 sm:p-7"><h3 className="text-2xl font-black">{section.title || section.name || "Menu"}</h3>{section.description ? <p className="mt-2 text-sm text-white/55">{section.description}</p> : null}<div className="mt-5 divide-y divide-white/10">{sectionItems.map((item) => <article key={String(item.id)} className={`grid gap-4 py-5 first:pt-0 last:pb-0 ${item.image_url ? "sm:grid-cols-[minmax(0,1fr)_120px]" : ""} ${item.is_available === false ? "opacity-50" : ""}`}><div><div className="flex items-start justify-between gap-5"><div className="min-w-0"><h4 className="font-black text-white">{item.name}</h4>{item.is_featured ? <span className="mt-2 inline-flex rounded-full bg-[rgba(225,6,42,.15)] px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-red-200">Featured</span> : null}</div>{menuPrice(item) ? <p className="shrink-0 font-black text-red-200">{menuPrice(item)}</p> : null}</div>{item.description ? <p className="mt-2 text-sm leading-6 text-white/55">{item.description}</p> : null}</div>{item.image_url ? <div className="h-24 overflow-hidden rounded-2xl border border-white/10 sm:h-[90px]"><SafeLocationImage src={item.image_url} alt={String(item.name || "Menu item")} fallbackType="hide" /></div> : null}</article>)}</div></section>; })}</div>;
}

function PhotosTab({ photos, heroPhoto, name }: { photos: string[]; heroPhoto: string; name: string }) {
  const gallery = Array.from(new Set([heroPhoto, ...photos].filter(Boolean))).slice(0, 12);
  if (!gallery.length) return <EmptyTab title="Photos are coming soon." description="This location does not have public photos available yet." />;
  return <div><div className="mb-7"><p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Photos</p><h2 className="mt-2 text-3xl font-black">See the space</h2></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{gallery.map((photo, index) => <div key={photo} className={`relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-[var(--toh-panel)] ${index === 0 ? "h-80 sm:col-span-2 lg:col-span-2" : "h-56"}`}><SafeLocationImage src={photo} alt={`${name} photo ${index + 1}`} className="transition duration-500 hover:scale-[1.02]" /></div>)}</div></div>;
}

function ReviewsTab({ reviews, loading, reviewCount, reviewScore }: { reviews: ReviewRecord[]; loading: boolean; reviewCount: number; reviewScore: number }) {
  if (loading) return <TabLoading label="Loading verified reviews…" />;
  return <div className="mx-auto max-w-5xl"><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Reviews</p><h2 className="mt-2 text-3xl font-black">What people are saying</h2></div>{reviewScore > 0 ? <div className="text-right"><p className="text-4xl font-black">{reviewScore.toFixed(1)}</p><p className="text-sm font-bold text-white/50"><span className="text-[var(--toh-red)]">★★★★★</span>{reviewCount ? ` · ${reviewCount} reviews` : ""}</p></div> : null}</div>{!reviews.length ? <EmptyTab title="No verified reviews yet." description="Verified TheOutHaven guest reviews will appear here after completed outings." /> : <div className="grid gap-4 md:grid-cols-2">{reviews.map((review) => <article key={String(review.id)} className="rounded-[1.4rem] border border-white/10 bg-[var(--toh-panel)] p-5"><div className="flex items-center justify-between gap-4"><p className="font-black">{review.customer_name || "TheOutHaven Guest"}</p><span className="rounded-full bg-[rgba(225,6,42,.15)] px-3 py-1 text-xs font-black text-red-100">{review.rating}/5</span></div><p className="mt-4 text-sm leading-7 text-white/65">{review.review_text}</p></article>)}</div>}</div>;
}

function InfoTab({ location, address, website, phone, mapsUrl, onWebsite, onDirections }: { location: LocationRecord; address: string; website: string; phone: string; mapsUrl: string; onWebsite: () => void; onDirections: () => void }) {
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"><section className="rounded-[1.6rem] border border-white/10 bg-[var(--toh-panel)] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Information</p><h2 className="mt-2 text-3xl font-black">Location details</h2><div className="mt-7 grid gap-3 sm:grid-cols-2">{address ? <InfoRow label="Address" value={address} action={mapsUrl ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={onDirections} className="text-sm font-black text-red-300">Get directions</a> : null} /> : null}{location.phone ? <InfoRow label="Phone" value={String(location.phone)} action={phone ? <a href={phone} className="text-sm font-black text-red-300">Call</a> : null} /> : null}{location.website ? <InfoRow label="Website" value={String(location.website)} action={website ? <a href={website} target="_blank" rel="noopener noreferrer" onClick={onWebsite} className="text-sm font-black text-red-300">Visit website</a> : null} /> : null}{location.price_range ? <InfoRow label="Price range" value={String(location.price_range)} /> : null}</div></section><section className="rounded-[1.6rem] border border-white/10 bg-[var(--toh-panel)] p-6 sm:p-7"><p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Hours</p><div className="mt-4 text-white/80"><LocationHours operating_hours={getOperatingHours(location)} special_hours={location.special_hours} google_current_opening_hours={location.google_current_opening_hours} google_regular_opening_hours={location.google_regular_opening_hours} google_utc_offset_minutes={location.google_utc_offset_minutes as number | string | null} timezone={(location.timezone || location.time_zone) as string | null} city={location.city} state={location.state} id={location.id} name={getLocationName(location)} /></div></section></div>;
}

function QuickStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="rounded-[1.3rem] border border-white/10 bg-[var(--toh-panel)] p-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/40">{label}</p><p className={`mt-2 text-sm font-black leading-6 ${accent ? "text-red-200" : "text-white"}`}>{value}</p></div>; }
function InfoRow({ label, value, action }: { label: string; value: string; action?: ReactNode }) { return <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.025] p-4"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">{label}</p><p className="mt-2 text-sm font-bold leading-6 text-white/80">{value}</p>{action ? <div className="mt-3">{action}</div> : null}</div>; }
function EmptyTab({ title, description }: { title: string; description: string }) { return <div className="mx-auto max-w-3xl rounded-[1.6rem] border border-white/10 bg-[var(--toh-panel)] p-8 text-center"><h2 className="text-2xl font-black">{title}</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/55">{description}</p></div>; }
function TabLoading({ label }: { label: string }) { return <div className="flex min-h-64 items-center justify-center rounded-[1.6rem] border border-white/10 bg-[var(--toh-panel)]"><p className="text-sm font-black text-white/55">{label}</p></div>; }
function LocationLoading() { return <><TheOutHavenHeader /><main className="flex min-h-screen items-center justify-center bg-[var(--toh-black)] px-5 pt-20 text-white"><div className="w-full max-w-2xl animate-pulse space-y-4"><div className="h-7 w-36 rounded-full bg-white/10" /><div className="h-14 w-4/5 rounded-2xl bg-white/10" /><div className="h-5 w-1/2 rounded-xl bg-white/10" /><div className="h-36 rounded-[1.6rem] bg-white/[0.06]" /></div></main></>; }
function LocationMissing({ onBack }: { onBack: () => void }) { return <><TheOutHavenHeader /><main className="flex min-h-screen items-center justify-center bg-[var(--toh-black)] px-5 pt-20 text-white"><div className="max-w-md rounded-[1.6rem] border border-white/10 bg-[var(--toh-panel)] p-7 text-center"><p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">TheOutHaven</p><h1 className="mt-3 text-3xl font-black">Location not found</h1><p className="mt-3 text-sm leading-6 text-white/55">This location is unavailable or is not currently published.</p><button onClick={onBack} className="toh-btn mt-6 px-6 py-3 text-sm">Back to results</button></div></main></>; }
