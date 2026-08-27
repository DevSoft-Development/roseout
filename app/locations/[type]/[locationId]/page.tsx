"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  ExternalLink,
  Globe2,
  Images,
  MapPin,
  Navigation,
  Phone,
  Share2,
  Sparkles,
  Star,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import LocationImagePlaceholder from "@/components/public-location/LocationImagePlaceholder";
import SafeLocationImage from "@/components/public-location/SafeLocationImage";
import { clampScore } from "@/lib/clampScore";
import { buildGoogleMapsSearchUrl, getGoogleMapsUrl } from "@/lib/googleDirections";
import { getLocationTags, getPrimaryCategory } from "@/lib/locationFields";
import { formatOperatingHoursForDisplay, getOperatingHours } from "@/lib/locationHours";
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
import { newYorkTodayISO } from "@/lib/reservations/reservationDate";
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
  rating?: number | string | null;
  google_rating?: number | string | null;
  average_rating?: number | string | null;
  user_ratings_total?: number | string | null;
  google_review_count?: number | string | null;
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
type SectionId = "overview" | "menu" | "photos" | "reviews" | "info";

const SECTIONS: Array<{ id: SectionId; label: string }> = [
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
  return text
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((item) => item.trim().replace(/^["']|["']$/g, "").replace(/[-_]+/g, " "))
    .filter(Boolean);
}

function titleCase(value: unknown) {
  const text = String(value || "").trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => (word.length <= 2 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");
}

function displayAddress(location: LocationRecord | null) {
  return [location?.address, location?.city, location?.state, location?.zip_code]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .join(", ");
}

function displayArea(location: LocationRecord | null) {
  return [location?.neighborhood, location?.city, location?.state]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 2)
    .join(", ");
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

function numeric(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function ratingFor(location: LocationRecord | null) {
  if (!location) return null;
  const direct = numeric(location.rating ?? location.google_rating ?? location.average_rating);
  if (direct && direct > 0 && direct <= 5) return direct;
  const reviewScore = numeric(location.review_score);
  return reviewScore && reviewScore > 0 && reviewScore <= 5 ? reviewScore : null;
}

function reviewCountFor(location: LocationRecord | null, fallback: number) {
  if (!location) return fallback;
  const count = numeric(location.review_count ?? location.user_ratings_total ?? location.google_review_count);
  return count && count > 0 ? Math.round(count) : fallback;
}

function safeInternalReturnHref(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/create";
  return value;
}

function plannerContextFromReturnHref(from: string) {
  try {
    const queryStart = from.indexOf("?");
    if (queryStart < 0) return "";
    const params = new URLSearchParams(from.slice(queryStart + 1));
    return (params.get("prompt") || params.get("q") || "").trim();
  } catch {
    return "";
  }
}

function appendQuery(href: string, values: Record<string, string>) {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const next = params.toString();
  return next ? `${path}?${next}` : path;
}

function friendlyDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export default function LocationDetailPage() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = String(params.type || "");
  const locationId = String(params.locationId || "");
  const returnHref = safeInternalReturnHref(searchParams.get("from"));

  const [location, setLocation] = useState<LocationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [menu, setMenu] = useState<MenuPayload | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [shareLabel, setShareLabel] = useState("Share");
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const [reservationDate, setReservationDate] = useState(() => newYorkTodayISO());
  const [partySize, setPartySize] = useState(2);

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

      const demoPreview =
        searchParams.get("demo") === "1" &&
        searchParams.get("fromDemoCenter") === "1" &&
        (searchParams.get("adminLocationId") === String(data?.id || locationId) || searchParams.get("locationId") === String(data?.id || locationId));
      const demoTagged =
        (data as Record<string, unknown> | null)?.demo_key === "real_location_mirror_demo" ||
        (data as { metadata?: { demo_key?: string } } | null)?.metadata?.demo_key === "real_location_mirror_demo";

      if (error || !data || (!isPublicSearchVisible(data) && !(demoPreview && demoTagged))) {
        if (!cancelled) {
          setLocation(null);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setLocation(data);
        setLoading(false);
      }
    }

    if (locationId) void loadLocation();
    return () => {
      cancelled = true;
    };
  }, [locationId, searchParams, supabase, type]);

  useEffect(() => {
    if (!location?.id) return;
    fetch("/api/analytics/location-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        location_id: location.id,
        event_type: "profile_view",
        event_source: "profile",
        metadata: { location_type: location.location_type || type, location_name: getLocationName(location) },
      }),
    }).catch(() => undefined);
  }, [location?.id, location?.location_type, type]);

  useEffect(() => {
    if (!location?.id) return;
    let cancelled = false;

    setReviewsLoading(true);
    supabase
      .from("location_reviews")
      .select("*")
      .eq("location_id", location.id)
      .eq("status", "approved")
      .eq("verified_visit", true)
      .order("created_at", { ascending: false })
      .limit(12)
      .then(({ data }) => {
        if (!cancelled) {
          setReviews((data || []) as ReviewRecord[]);
          setReviewsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [location?.id, supabase]);

  useEffect(() => {
    if (!location?.id) return;
    let cancelled = false;

    setMenuLoading(true);
    fetch(`/api/public/menu?locationId=${encodeURIComponent(String(location.id))}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Menu unavailable"))))
      .then((response: PublicMenuResponse) => {
        if (!cancelled) {
          setMenu(response.data || null);
          setMenuLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMenu(null);
          setMenuLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [location?.id]);

  useEffect(() => {
    if (!location) return;
    const elements = SECTIONS.map((section) => document.getElementById(section.id)).filter((element): element is HTMLElement => Boolean(element));
    if (!elements.length || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActiveSection(visible.target.id as SectionId);
      },
      { rootMargin: "-150px 0px -62% 0px", threshold: [0.05, 0.2, 0.45] },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [location]);

  const isActivity = location?.location_type === "activity" || type === "activities" || type === "activity";
  const name = getLocationName(location, "TheOutHaven Location");
  const category = getPrimaryCategory(location);
  const area = displayArea(location);
  const address = displayAddress(location);
  const primaryPhoto = getPrimaryPhoto(location) || "";
  const photos = Array.from(new Set([primaryPhoto, ...getPhotoList(location)].filter(Boolean))).slice(0, 18);
  const website = websiteHref(location);
  const phone = phoneHref(location);
  const mapsUrl = useMemo(() => getGoogleMapsUrl(location) || buildGoogleMapsSearchUrl(location), [location]);
  const tags = Array.from(
    new Set(
      [
        ...toArray(getLocationTags(location)),
        ...toArray(location?.atmosphere),
        ...toArray(location?.best_for),
        ...toArray(location?.special_features),
      ]
        .map(titleCase)
        .filter(Boolean),
    ),
  ).slice(0, 8);
  const score = Math.round(clampScore(getLocationScore(location)));
  const reviewScore = ratingFor(location);
  const reviewCount = reviewCountFor(location, reviews.length);
  const hours = formatOperatingHoursForDisplay(getOperatingHours(location));
  const plannerContext = plannerContextFromReturnHref(returnHref);

  const externalReservationUrl = getExternalReservationUrl(location || {});
  const externalReservationProvider = getExternalReservationProvider(location || {});
  const internalReservationHref = getInternalReservationHref(location || {}, isActivity ? "activity" : "restaurant");
  const reservationSource = String(location?.reservation_source || "external").toLowerCase();
  const internalEnabled = Boolean(location?.internal_reservations_enabled || location?.uses_internal_reservations || location?.reservation_enabled === true);
  const canUseInternal = (reservationSource === "internal" || reservationSource === "both") && internalEnabled && Boolean(internalReservationHref);
  const canUseExternal = (reservationSource === "external" || reservationSource === "both") && Boolean(externalReservationUrl);
  const reservationSourceLabel = getReservationSourceLabel(location || {});
  const internalAvailabilityHref = canUseInternal && internalReservationHref
    ? appendQuery(String(internalReservationHref), { date: reservationDate, partySize: String(partySize) })
    : "";
  const planHref = `/create?locationId=${encodeURIComponent(String(location?.id || locationId))}&locationType=${encodeURIComponent(isActivity ? "activity" : "restaurant")}`;
  const primaryActionHref = internalAvailabilityHref || (canUseExternal ? String(externalReservationUrl) : planHref);
  const primaryActionLabel = canUseInternal
    ? isActivity
      ? "Check Availability"
      : "Find a Table"
    : canUseExternal
      ? externalReservationProvider
        ? `Reserve via ${externalReservationProvider}`
        : "Check Availability"
      : "Add to Outing";
  const primaryActionExternal = !canUseInternal && canUseExternal;
  const menuItems = menu?.items || [];
  const menuPreview = [...menuItems]
    .filter((item) => item.is_available !== false)
    .sort((a, b) => Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured)))
    .slice(0, 6);
  const reviewPreview = reviews.slice(0, 3);

  function trackBusinessEvent(eventType: "reservation_started" | "website_click" | "directions_click") {
    if (!location?.id) return;
    fetch("/api/analytics/location-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        location_id: location.id,
        event_type: eventType,
        event_source: "profile",
        metadata: { location_id: locationId, location_type: location.location_type || type, location_name: name },
      }),
    }).catch(() => undefined);
  }

  function goBack() {
    trackActivity({
      eventType: "navigation",
      eventName: "Back To Results",
      pagePath: window.location.pathname,
      metadata: { location_id: locationId, location_type: location?.location_type || type, source: "location_detail_page" },
    });
    if (window.history.length > 1) router.back();
    else router.push(returnHref);
  }

  function scrollToSection(section: SectionId) {
    setActiveSection(section);
    document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function shareLocation() {
    try {
      if (navigator.share) {
        await navigator.share({ title: name, text: `Check out ${name} on TheOutHaven`, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setShareLabel("Copied");
        window.setTimeout(() => setShareLabel("Share"), 1800);
      }
    } catch {
      // Native share cancelled.
    }
  }

  if (loading) return <LocationLoading />;
  if (!location) return <LocationMissing onBack={() => router.push(returnHref)} />;

  return (
    <>
      <TheOutHavenHeader />
      <main className="min-h-screen bg-[#050505] pb-28 pt-20 text-white md:pb-16">
        <div className="toh-container py-4 sm:py-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-black text-white/70 transition hover:border-white/20 hover:text-white"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              type="button"
              onClick={() => void shareLocation()}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-black text-white/70 transition hover:border-white/20 hover:text-white"
            >
              <Share2 size={16} /> {shareLabel}
            </button>
          </div>
        </div>

        <div className="toh-container">
          <PhotoMosaic photos={photos} name={name} onOpen={setPhotoIndex} />
        </div>

        <div className="toh-container mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start xl:gap-12">
          <div className="min-w-0">
            <section id="overview" className="scroll-mt-36">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#e1062a] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white">
                      {category || (isActivity ? "Activity" : "Restaurant")}
                    </span>
                    {area ? <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-bold text-white/65">{area}</span> : null}
                  </div>
                  <h1 className="text-4xl font-black tracking-[-0.04em] sm:text-5xl lg:text-6xl">{name}</h1>
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-bold text-white/68 sm:text-base">
                    {reviewScore ? (
                      <span className="inline-flex items-center gap-1.5 text-white">
                        <Star size={16} className="fill-[#e1062a] text-[#e1062a]" /> {reviewScore.toFixed(1)}
                        {reviewCount ? <span className="text-white/45">({reviewCount.toLocaleString()})</span> : null}
                      </span>
                    ) : null}
                    {location.price_range ? <span>{String(location.price_range)}</span> : null}
                    {category ? <span>{category}</span> : null}
                    {area ? <span>{area}</span> : null}
                  </div>
                </div>
                {score > 0 ? (
                  <div className="rounded-2xl border border-[#e1062a]/25 bg-[#e1062a]/10 px-4 py-3 text-right">
                    <p className="text-[9px] font-black uppercase tracking-[0.17em] text-[#ff8da0]">TheOutHaven score</p>
                    <p className="mt-1 text-2xl font-black">{score}</p>
                  </div>
                ) : null}
              </div>

              {tags.length ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-bold text-white/68">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              {plannerContext ? (
                <div className="mt-7 rounded-[1.4rem] border border-[#e1062a]/25 bg-[linear-gradient(135deg,rgba(225,6,42,.12),rgba(255,255,255,.025))] p-5 sm:p-6">
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e1062a] text-white">
                      <Sparkles size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff8da0]">From your outing search</p>
                      <p className="mt-1 text-lg font-black text-white">“{plannerContext}”</p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-white/55">
                        Review the photos, menu, atmosphere, and booking options here, then return to your outing without losing your place.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <nav className="sticky top-20 z-30 -mx-4 mt-7 border-y border-white/10 bg-[#050505]/96 px-4 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-2">
                <div className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Location sections">
                  {SECTIONS.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => scrollToSection(section.id)}
                      className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-black transition ${
                        activeSection === section.id ? "bg-white text-black" : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
              </nav>

              <div className="mt-8 border-b border-white/10 pb-9">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a]">About</p>
                <h2 className="mt-2 text-2xl font-black sm:text-3xl">What to expect</h2>
                <p className="mt-4 max-w-3xl whitespace-pre-line text-base font-medium leading-8 text-white/65">
                  {location.description || `Explore ${name}${area ? ` in ${area}` : ""}. See what it feels like, what to order or do, and how to plan your visit.`}
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <InfoPill icon={<MapPin size={17} />} label="Area" value={area || "See location"} />
                  <InfoPill icon={<Sparkles size={17} />} label="Best for" value={tags[0] || category || "Outings"} />
                  <InfoPill icon={<Images size={17} />} label="Photos" value={photos.length ? `${photos.length} available` : "Coming soon"} />
                </div>
              </div>
            </section>

            <section id="menu" className="scroll-mt-36 border-b border-white/10 py-9">
              <SectionHeading eyebrow="Menu" title={menu?.page?.title || (isActivity ? "What to expect" : "Popular here")} />
              {menuLoading ? (
                <LoadingRows count={3} />
              ) : menuPreview.length ? (
                <>
                  {menu?.page?.description ? <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/50">{menu.page.description}</p> : null}
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {menuPreview.map((item) => (
                      <article key={String(item.id || item.name)} className="rounded-2xl border border-white/10 bg-[#0e0e0e] p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-black text-white">{String(item.name || "Menu item")}</h3>
                              {item.is_featured ? <span className="rounded-full bg-[#e1062a]/15 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-[#ff8da0]">Featured</span> : null}
                            </div>
                            {item.description ? <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-white/48">{String(item.description)}</p> : null}
                          </div>
                          {menuPrice(item) ? <span className="shrink-0 font-black text-white">{menuPrice(item)}</span> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                  <Link
                    href={`/locations/${encodeURIComponent(type)}/${encodeURIComponent(locationId)}/menu`}
                    className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 px-5 text-sm font-black text-white/70 transition hover:border-white/20 hover:text-white"
                  >
                    View full menu <ExternalLink size={15} />
                  </Link>
                </>
              ) : (
                <EmptyInline title={isActivity ? "Details are still being added." : "Menu not published yet."} description="This location has not published this section on TheOutHaven yet." />
              )}
            </section>

            <section id="photos" className="scroll-mt-36 border-b border-white/10 py-9">
              <SectionHeading eyebrow="Photos" title="See the place before you go" />
              {photos.length ? (
                <>
                  <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {photos.slice(0, 6).map((photo, index) => (
                      <button
                        key={`${photo}-${index}`}
                        type="button"
                        onClick={() => setPhotoIndex(index)}
                        className={`relative overflow-hidden rounded-2xl bg-white/[0.04] ${index === 0 ? "col-span-2 aspect-[2/1] sm:col-span-2" : "aspect-square"}`}
                      >
                        <SafeLocationImage src={photo} alt={`${name} photo ${index + 1}`} className="object-cover transition duration-300 hover:scale-[1.02]" />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPhotoIndex(0)}
                    className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 px-5 text-sm font-black text-white/70 transition hover:border-white/20 hover:text-white"
                  >
                    <Images size={16} /> View all {photos.length} photos
                  </button>
                </>
              ) : (
                <EmptyInline title="Photos are coming soon." description="This profile does not have a public photo gallery yet." />
              )}
            </section>

            <section id="reviews" className="scroll-mt-36 border-b border-white/10 py-9">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <SectionHeading eyebrow="Reviews" title="What guests say" />
                {reviewScore ? (
                  <div className="text-right">
                    <p className="inline-flex items-center gap-1 text-2xl font-black"><Star size={20} className="fill-[#e1062a] text-[#e1062a]" /> {reviewScore.toFixed(1)}</p>
                    <p className="mt-1 text-xs font-bold text-white/40">{reviewCount ? `${reviewCount.toLocaleString()} reviews` : "Guest rating"}</p>
                  </div>
                ) : null}
              </div>

              {reviewsLoading ? (
                <LoadingRows count={3} />
              ) : reviewPreview.length ? (
                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  {reviewPreview.map((review, index) => (
                    <article key={String(review.id || index)} className="rounded-2xl border border-white/10 bg-[#0e0e0e] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-black text-white">{String(review.customer_name || "TheOutHaven guest")}</p>
                        <span className="inline-flex items-center gap-1 text-sm font-black"><Star size={14} className="fill-[#e1062a] text-[#e1062a]" /> {numeric(review.rating)?.toFixed(1) || "5.0"}</span>
                      </div>
                      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-300">Verified visit</p>
                      {review.review_text ? <p className="mt-3 line-clamp-5 text-sm font-semibold leading-6 text-white/55">{String(review.review_text)}</p> : null}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyInline title="No verified visit reviews yet." description="TheOutHaven reviews appear here after verified outings." />
              )}
            </section>

            <section id="info" className="scroll-mt-36 py-9">
              <SectionHeading eyebrow="Location & Info" title="Everything you need for the visit" />
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.4rem] border border-white/10 bg-[#0e0e0e] p-5 sm:p-6">
                  <div className="flex items-center gap-2 text-white"><Clock3 size={18} className="text-[#e1062a]" /><h3 className="font-black">Hours</h3></div>
                  <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-7 text-white/55">{hours || "Hours are not available yet."}</p>
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-[#0e0e0e] p-5 sm:p-6">
                  <div className="flex items-center gap-2 text-white"><MapPin size={18} className="text-[#e1062a]" /><h3 className="font-black">Location</h3></div>
                  <p className="mt-3 text-sm font-semibold leading-6 text-white/58">{address || area || "Address not listed yet."}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackBusinessEvent("directions_click")} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-4 text-xs font-black text-white/70 hover:text-white"><Navigation size={14} /> Directions</a> : null}
                    {phone ? <a href={phone} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-4 text-xs font-black text-white/70 hover:text-white"><Phone size={14} /> Call</a> : null}
                    {website ? <a href={website} target="_blank" rel="noopener noreferrer" onClick={() => trackBusinessEvent("website_click")} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-4 text-xs font-black text-white/70 hover:text-white"><Globe2 size={14} /> Website</a> : null}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="hidden lg:block lg:sticky lg:top-28">
            <BookingCard
              isActivity={isActivity}
              canUseInternal={canUseInternal}
              canUseExternal={canUseExternal}
              provider={externalReservationProvider}
              sourceLabel={reservationSourceLabel}
              date={reservationDate}
              onDateChange={setReservationDate}
              partySize={partySize}
              onPartySizeChange={setPartySize}
              href={primaryActionHref}
              label={primaryActionLabel}
              external={primaryActionExternal}
              onPrimaryAction={() => {
                if (canUseInternal || canUseExternal) trackBusinessEvent("reservation_started");
              }}
              website={website}
              phone={phone}
              mapsUrl={mapsUrl}
              onWebsite={() => trackBusinessEvent("website_click")}
              onDirections={() => trackBusinessEvent("directions_click")}
            />
          </aside>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#050505]/96 px-3 py-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-black text-white">{canUseInternal ? `${friendlyDate(reservationDate)} · ${partySize} ${partySize === 1 ? "guest" : "guests"}` : name}</p>
            <p className="mt-0.5 truncate text-[10px] font-bold text-white/40">{canUseInternal ? "See live availability" : canUseExternal ? `Availability on ${externalReservationProvider || "booking provider"}` : "Add this stop to an outing"}</p>
          </div>
          <a
            href={primaryActionHref}
            target={primaryActionExternal ? "_blank" : undefined}
            rel={primaryActionExternal ? "noopener noreferrer" : undefined}
            onClick={() => {
              if (canUseInternal || canUseExternal) trackBusinessEvent("reservation_started");
            }}
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-[#e1062a] px-5 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#ff1744]"
          >
            {canUseInternal ? (isActivity ? "Check Times" : "Find a Table") : canUseExternal ? "Reserve" : "Add to Outing"}
          </a>
        </div>
      </div>

      {photoIndex !== null && photos[photoIndex] ? (
        <PhotoViewer photos={photos} index={photoIndex} name={name} onClose={() => setPhotoIndex(null)} onChange={setPhotoIndex} />
      ) : null}
    </>
  );
}

function PhotoMosaic({ photos, name, onOpen }: { photos: string[]; name: string; onOpen: (index: number) => void }) {
  if (!photos.length) {
    return (
      <div className="relative h-72 overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0e0e0e] sm:h-96">
        <LocationImagePlaceholder label="Photos coming soon" />
      </div>
    );
  }

  return (
    <>
      <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
        {photos.slice(0, 8).map((photo, index) => (
          <button key={`${photo}-${index}`} type="button" onClick={() => onOpen(index)} className="relative h-72 w-[88%] shrink-0 snap-center overflow-hidden rounded-2xl bg-white/[0.04]">
            <SafeLocationImage src={photo} alt={`${name} photo ${index + 1}`} priority={index === 0} className="object-cover" />
            <span className="absolute bottom-3 right-3 rounded-full bg-black/75 px-3 py-1.5 text-xs font-black text-white backdrop-blur-md">{index + 1} / {photos.length}</span>
          </button>
        ))}
      </div>

      <div className="hidden h-[430px] grid-cols-[1.7fr_1fr] gap-2 overflow-hidden rounded-[1.6rem] lg:grid">
        <button type="button" onClick={() => onOpen(0)} className="relative overflow-hidden bg-white/[0.04]">
          <SafeLocationImage src={photos[0]} alt={`${name} main photo`} priority className="object-cover transition duration-300 hover:scale-[1.01]" />
        </button>
        <div className="grid grid-cols-2 grid-rows-2 gap-2">
          {[1, 2, 3, 4].map((index) => {
            const photo = photos[index];
            if (!photo) return <div key={index} className="bg-white/[0.035]" />;
            const isLast = index === Math.min(4, photos.length - 1);
            return (
              <button key={`${photo}-${index}`} type="button" onClick={() => onOpen(index)} className="relative overflow-hidden bg-white/[0.04]">
                <SafeLocationImage src={photo} alt={`${name} photo ${index + 1}`} className="object-cover transition duration-300 hover:scale-[1.02]" />
                {isLast && photos.length > 5 ? (
                  <span className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full bg-black/80 px-3 py-2 text-xs font-black text-white backdrop-blur-md">
                    <Images size={14} /> View all {photos.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function BookingCard({
  isActivity,
  canUseInternal,
  canUseExternal,
  provider,
  sourceLabel,
  date,
  onDateChange,
  partySize,
  onPartySizeChange,
  href,
  label,
  external,
  onPrimaryAction,
  website,
  phone,
  mapsUrl,
  onWebsite,
  onDirections,
}: {
  isActivity: boolean;
  canUseInternal: boolean;
  canUseExternal: boolean;
  provider: string | null;
  sourceLabel: string | null;
  date: string;
  onDateChange: (value: string) => void;
  partySize: number;
  onPartySizeChange: (value: number) => void;
  href: string;
  label: string;
  external: boolean;
  onPrimaryAction: () => void;
  website: string;
  phone: string;
  mapsUrl: string;
  onWebsite: () => void;
  onDirections: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[1.55rem] border border-white/10 bg-[#101010] shadow-2xl shadow-black/35">
      <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(225,6,42,.13),rgba(255,255,255,.025))] p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff8da0]">Plan your visit</p>
        <h2 className="mt-2 text-2xl font-black">{canUseInternal ? (isActivity ? "Book your spot" : "Find a table") : canUseExternal ? "Reserve this place" : "Make it part of your outing"}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-white/50">
          {canUseInternal
            ? "Choose your date and party size, then see live availability."
            : canUseExternal
              ? `Live availability continues on ${provider || "the booking provider"}.`
              : "TheOutHaven can use this location as a stop in a complete outing."}
        </p>
      </div>

      <div className="p-5">
        {canUseInternal ? (
          <div className="grid gap-3">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-black text-white/55"><CalendarDays size={15} /> Date</span>
              <input type="date" min={newYorkTodayISO()} value={date} onChange={(event) => onDateChange(event.target.value)} className="min-h-12 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-base font-bold text-white outline-none transition focus:border-[#e1062a]" />
            </label>
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-black text-white/55"><Users size={15} /> Party size</span>
              <select value={partySize} onChange={(event) => onPartySizeChange(Number(event.target.value))} className="min-h-12 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-base font-bold text-white outline-none transition focus:border-[#e1062a]">
                {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} {value === 1 ? "guest" : "guests"}</option>)}
              </select>
            </label>
            <p className="text-xs font-semibold text-white/38">Times and seating options appear on the next step.</p>
          </div>
        ) : null}

        {sourceLabel ? <p className="mt-4 text-xs font-bold text-white/38">{sourceLabel}</p> : null}

        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          onClick={onPrimaryAction}
          className="mt-5 flex min-h-12 w-full items-center justify-center rounded-full bg-[#e1062a] px-5 text-sm font-black text-white transition hover:bg-[#ff1744]"
        >
          {label} {external ? <ExternalLink className="ml-2" size={15} /> : null}
        </a>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={onDirections} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.025] text-[10px] font-black text-white/55 transition hover:text-white"><Navigation size={17} /> Directions</a> : <div />}
          {phone ? <a href={phone} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.025] text-[10px] font-black text-white/55 transition hover:text-white"><Phone size={17} /> Call</a> : <div />}
          {website ? <a href={website} target="_blank" rel="noopener noreferrer" onClick={onWebsite} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.025] text-[10px] font-black text-white/55 transition hover:text-white"><Globe2 size={17} /> Website</a> : <div />}
        </div>
      </div>
    </div>
  );
}

function InfoPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0e0e0e] p-4">
      <div className="flex items-center gap-2 text-[#ff7188]">{icon}<span className="text-[9px] font-black uppercase tracking-[0.15em]">{label}</span></div>
      <p className="mt-2 line-clamp-2 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black tracking-[-0.025em] sm:text-3xl">{title}</h2>
    </div>
  );
}

function LoadingRows({ count }: { count: number }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      {Array.from({ length: count }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />)}
    </div>
  );
}

function EmptyInline({ title, description }: { title: string; description: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <p className="font-black text-white">{title}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-white/45">{description}</p>
    </div>
  );
}

function PhotoViewer({ photos, index, name, onClose, onChange }: { photos: string[]; index: number; name: string; onClose: () => void; onChange: (index: number) => void }) {
  const previous = (index - 1 + photos.length) % photos.length;
  const next = (index + 1) % photos.length;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={`${name} photo gallery`}>
      <button type="button" onClick={onClose} className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/65 text-white" aria-label="Close gallery"><X size={20} /></button>
      {photos.length > 1 ? <button type="button" onClick={() => onChange(previous)} className="absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/65 text-white sm:left-6" aria-label="Previous photo"><ChevronLeft size={22} /></button> : null}
      <div className="relative h-[72vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-[#090909]">
        <SafeLocationImage src={photos[index]} alt={`${name} photo ${index + 1}`} priority className="object-contain" />
        <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1.5 text-xs font-black text-white">{index + 1} / {photos.length}</span>
      </div>
      {photos.length > 1 ? <button type="button" onClick={() => onChange(next)} className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/65 text-white sm:right-6" aria-label="Next photo"><ChevronRight size={22} /></button> : null}
    </div>
  );
}

function LocationLoading() {
  return (
    <>
      <TheOutHavenHeader />
      <main className="min-h-screen bg-[#050505] px-4 pb-16 pt-24 text-white">
        <div className="mx-auto max-w-7xl animate-pulse">
          <div className="h-10 w-28 rounded-full bg-white/[0.05]" />
          <div className="mt-5 h-[420px] rounded-[1.6rem] bg-white/[0.04]" />
          <div className="mt-7 h-12 w-2/3 rounded-xl bg-white/[0.05]" />
          <div className="mt-4 h-24 rounded-2xl bg-white/[0.035]" />
        </div>
      </main>
    </>
  );
}

function LocationMissing({ onBack }: { onBack: () => void }) {
  return (
    <>
      <TheOutHavenHeader />
      <main className="flex min-h-screen items-center justify-center bg-[#050505] px-4 pt-20 text-white">
        <div className="max-w-lg text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a]">Location unavailable</p>
          <h1 className="mt-3 text-3xl font-black">We can’t show this profile right now.</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-white/50">It may no longer be searchable, or the profile may still be getting prepared.</p>
          <button type="button" onClick={onBack} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#e1062a] px-6 text-sm font-black"><ArrowLeft size={16} /> Back</button>
        </div>
      </main>
    </>
  );
}
