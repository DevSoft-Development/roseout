import type { Metadata } from "next";
import Link from "next/link";
import AdminLocationsSearchBox from "./AdminLocationsSearchBox";
import ImpersonateButton from "@/components/admin/ImpersonateButton";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getPrimaryCategory } from "@/lib/locationFields";
import { getIsClaimed, type LocationClaimFields } from "@/lib/locationClaim";
import { ADMIN_PAGE_ACCESS, canAdmin } from "@/lib/admin-permissions";
import {
  getLocationScore,
  type LocationScoreFields,
} from "@/lib/locationScore";
import {
  getDataStatus,
  getMissingFields,
  isPubliclyVisible,
  type LocationVisibilityFields,
} from "@/lib/locationVisibility";

const ADMIN_LOCATIONS_VERSION = "admin-locations-refresh-2026-05-11";
const ADMIN_LOCATIONS_BASE_PATH = "/admin/dashboard/locations";
const PAGE_SIZE_OPTIONS = [100, 250, 500, 1000] as const;

export const metadata: Metadata = {
  title: "Locations | TheOutHaven Admin",
  description: "Search, filter, edit, and audit TheOutHaven locations.",
};

type SearchParams = {
  q?: string;
  type?: string;
  status?: string;
  claim?: string;
  page?: string;
  pageSize?: string;
  review?: string;
};

type AdminLocation = LocationScoreFields &
  LocationVisibilityFields & {
    id: string;
    locationType: "restaurants" | "activities";
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    category: string | null;
    primary_category?: string | null;
    cuisine?: string | null;
    cuisine_type?: string | null;
    food_type?: string | null;
    activity_type?: string | null;
    primary_tag?: string | null;
    tags?: string[] | null;
    google_types?: string[] | null;
    status: string | null;
    is_claimed?: boolean | null;
    claimed?: boolean | null;
    claim_status?: string | null;
    claimed_at?: string | null;
    claimed_by_email?: string | null;
    owner_user_id?: string | null;
    rating: number | null;
    view_count: number | null;
    click_count: number | null;
    main_image?: string | null;
    image_url?: string | null;
    images?: string[] | null;
    created_at: string | null;
    quality_status?: string | null;
    has_photos?: boolean | null;
    photo_status?: string | null;
    is_low_level?: boolean | null;
    low_level_reason?: string | null;
    public_visibility_tier?: string | null;
    curation_tier?: string | null;
    source_quality_status?: string | null;
    import_confidence?: string | null;
  };

type AdminRestaurantRow = Omit<
  AdminLocation,
  "locationType" | "name" | "category"
> &
  LocationClaimFields & {
    name?: string | null;
    restaurant_name: string | null;
    cuisine_type: string | null;
  };

type AdminActivityRow = Omit<
  AdminLocation,
  "locationType" | "name" | "category"
> &
  LocationClaimFields & {
    name?: string | null;
    activity_name: string | null;
    activity_type: string | null;
  };

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function formatFullAddress(item: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}) {
  const street = item.address?.trim();
  const city = item.city?.trim();
  const state = item.state?.trim();
  const zip = item.zip_code?.trim();

  const cityStateZip = [city, state, zip].filter(Boolean).join(", ");

  return (
    [street, cityStateZip].filter(Boolean).join(" • ") || "Address not listed"
  );
}

function statusBadge(status?: string | null) {
  const value = status || "unknown";

  if (value === "approved")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "pending") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "rejected") return "border-red-200 bg-red-50 text-red-700";
  if (value === "draft")
    return "border-neutral-200 bg-neutral-100 text-neutral-700";

  return "border-neutral-200 bg-neutral-100 text-neutral-600";
}

function typeBadge(type: "restaurants" | "activities") {
  if (type === "restaurants") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-purple-200 bg-purple-50 text-purple-700";
}

function buildQueryUrl({
  q,
  type,
  status,
  claim,
  review = "all",
  page = 1,
  pageSize,
}: {
  q: string;
  type: string;
  status: string;
  claim: string;
  review?: string;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();

  if (q) params.set("q", q);
  if (type !== "all") params.set("type", type);
  if (status !== "all") params.set("status", status);
  if (claim !== "all") params.set("claim", claim);
  if (review !== "all") params.set("review", review);
  params.set("page", String(page));
  if (pageSize) params.set("pageSize", String(pageSize));

  return `${ADMIN_LOCATIONS_BASE_PATH}?${params.toString()}`;
}

export default async function AdminLocationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const currentAdmin = await requireAdminRole(ADMIN_PAGE_ACCESS.locations);
  const canImpersonate = canAdmin(currentAdmin.role, "impersonation");

  const params = await searchParams;

  const q = params.q?.trim() || "";
  const safeQ = q.replace(/[%_,]/g, " ").trim();
  const type = params.type || "all";
  const status = params.status || "all";
  const claim = params.claim || "all";
  const review = params.review || "all";
  const page = Math.max(1, Number(params.page || 1));
  const requestedPageSize = Number(params.pageSize || 100);
  const pageSize = PAGE_SIZE_OPTIONS.includes(requestedPageSize as (typeof PAGE_SIZE_OPTIONS)[number])
    ? requestedPageSize
    : 100;
  const perTablePageSize = type === "all" ? Math.ceil(pageSize / 2) : pageSize;
  const queryFrom = (page - 1) * perTablePageSize;
  const queryTo = queryFrom + perTablePageSize - 1;

  const shouldLoadRestaurants = type === "all" || type === "restaurants";
  const shouldLoadActivities = type === "all" || type === "activities";

  let restaurantsQuery = supabase
    .from("restaurants")
    .select(
      "id, name, restaurant_name, address, city, state, zip_code, status, is_searchable, data_status, missing_fields, is_hidden, last_quality_check_at, is_claimed, claimed, claim_status, claimed_at, claimed_by_email, owner_user_id, primary_category, cuisine, cuisine_type, food_type, primary_tag, phone, google_place_id, claim_code, tags, google_types, rating, view_count, click_count, theouthaven_score, roseout_score, quality_score, trend_score, conversion_score, review_score, popularity_score, ranking_badge, main_image, image_url, images, created_at, quality_status, has_photos, photo_status, is_low_level, low_level_reason, public_visibility_tier, curation_tier, source_quality_status, import_confidence",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(queryFrom, queryTo);

  let activitiesQuery = supabase
    .from("activities")
    .select(
      "id, name, activity_name, primary_category, activity_type, primary_tag, phone, google_place_id, claim_code, tags, google_types, address, city, state, zip_code, status, is_searchable, data_status, missing_fields, is_hidden, last_quality_check_at, is_claimed, claimed, claim_status, claimed_at, claimed_by_email, owner_user_id, rating, view_count, click_count, theouthaven_score, roseout_score, quality_score, trend_score, conversion_score, review_score, popularity_score, ranking_badge, main_image, image_url, images, created_at, quality_status, has_photos, photo_status, is_low_level, low_level_reason, public_visibility_tier, curation_tier, source_quality_status, import_confidence",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(queryFrom, queryTo);

  if (status !== "all") {
    restaurantsQuery = restaurantsQuery.eq("status", status);
    activitiesQuery = activitiesQuery.eq("status", status);
  }

  if (claim === "claimed") {
    restaurantsQuery = restaurantsQuery.or(
      "is_claimed.eq.true,and(is_claimed.is.null,claimed.eq.true)",
    );
    activitiesQuery = activitiesQuery.or(
      "is_claimed.eq.true,and(is_claimed.is.null,claimed.eq.true)",
    );
  }

  if (claim === "unclaimed") {
    restaurantsQuery = restaurantsQuery.or(
      "is_claimed.eq.false,and(is_claimed.is.null,claimed.eq.false),and(is_claimed.is.null,claimed.is.null)",
    );
    activitiesQuery = activitiesQuery.or(
      "is_claimed.eq.false,and(is_claimed.is.null,claimed.eq.false),and(is_claimed.is.null,claimed.is.null)",
    );
  }

  if (review === "low-level-hidden") {
    restaurantsQuery = restaurantsQuery.eq("is_low_level", true);
    activitiesQuery = activitiesQuery.eq("is_low_level", true);
  }

  if (review === "nyc-unverified") {
    restaurantsQuery = restaurantsQuery.eq("low_level_reason", "nyc_import_unverified");
    activitiesQuery = activitiesQuery.eq("low_level_reason", "nyc_import_unverified");
  }

  if (review === "missing-photos") {
    restaurantsQuery = restaurantsQuery.or("has_photos.eq.false,photo_status.eq.missing_photo");
    activitiesQuery = activitiesQuery.or("has_photos.eq.false,photo_status.eq.missing_photo");
  }

  if (review === "publish-ready") {
    restaurantsQuery = restaurantsQuery.eq("quality_status", "publish_ready");
    activitiesQuery = activitiesQuery.eq("quality_status", "publish_ready");
  }

  if (safeQ) {
    restaurantsQuery = restaurantsQuery.or(
      `name.ilike.%${safeQ}%,restaurant_name.ilike.%${safeQ}%,address.ilike.%${safeQ}%,city.ilike.%${safeQ}%,state.ilike.%${safeQ}%,zip_code.ilike.%${safeQ}%,phone.ilike.%${safeQ}%,primary_category.ilike.%${safeQ}%,cuisine.ilike.%${safeQ}%,cuisine_type.ilike.%${safeQ}%,food_type.ilike.%${safeQ}%,primary_tag.ilike.%${safeQ}%,google_place_id.ilike.%${safeQ}%,claim_code.ilike.%${safeQ}%,data_status.ilike.%${safeQ}%`,
    );

    activitiesQuery = activitiesQuery.or(
      `name.ilike.%${safeQ}%,activity_name.ilike.%${safeQ}%,address.ilike.%${safeQ}%,city.ilike.%${safeQ}%,state.ilike.%${safeQ}%,zip_code.ilike.%${safeQ}%,phone.ilike.%${safeQ}%,primary_category.ilike.%${safeQ}%,activity_type.ilike.%${safeQ}%,primary_tag.ilike.%${safeQ}%,google_place_id.ilike.%${safeQ}%,claim_code.ilike.%${safeQ}%,data_status.ilike.%${safeQ}%`,
    );
  }

  const [
    restaurantsResult,
    activitiesResult,
    totalRestaurantsResult,
    totalActivitiesResult,
  ] = await Promise.all([
    shouldLoadRestaurants
      ? restaurantsQuery
      : Promise.resolve({ data: [], error: null, count: 0 }),
    shouldLoadActivities
      ? activitiesQuery
      : Promise.resolve({ data: [], error: null, count: 0 }),
    supabase.from("restaurants").select("id", { count: "exact", head: true }),
    supabase.from("activities").select("id", { count: "exact", head: true }),
  ]);

  const restaurantRows: AdminLocation[] =
    (restaurantsResult.data as AdminRestaurantRow[] | null)?.map((item) => ({
      id: item.id,
      locationType: "restaurants",
      name: getLocationName(item, "Untitled restaurant"),
      address: item.address,
      city: item.city,
      state: item.state,
      zip_code: item.zip_code,
      category: getPrimaryCategory(item),
      status: item.status,
      is_searchable: item.is_searchable,
      data_status: item.data_status,
      missing_fields: item.missing_fields,
      is_hidden: item.is_hidden,
      last_quality_check_at: item.last_quality_check_at,
      is_claimed: item.is_claimed,
      claimed: item.claimed,
      claim_status: item.claim_status,
      claimed_at: item.claimed_at,
      claimed_by_email: item.claimed_by_email,
      owner_user_id: item.owner_user_id,
      rating: item.rating,
      view_count: item.view_count,
      click_count: item.click_count,
      theouthaven_score: item.theouthaven_score,
      roseout_score: item.roseout_score,
      quality_score: item.quality_score,
      trend_score: item.trend_score,
      conversion_score: item.conversion_score,
      review_score: item.review_score,
      popularity_score: item.popularity_score,
      ranking_badge: item.ranking_badge,
      main_image: item.main_image,
      image_url: item.image_url,
      images: item.images,
      created_at: item.created_at,
      quality_status: item.quality_status,
      has_photos: item.has_photos,
      photo_status: item.photo_status,
      is_low_level: item.is_low_level,
      low_level_reason: item.low_level_reason,
      public_visibility_tier: item.public_visibility_tier,
      curation_tier: item.curation_tier,
      source_quality_status: item.source_quality_status,
      import_confidence: item.import_confidence,
    })) || [];

  const activityRows: AdminLocation[] =
    (activitiesResult.data as AdminActivityRow[] | null)?.map((item) => ({
      id: item.id,
      locationType: "activities",
      name: getLocationName(item, "Untitled activity"),
      address: item.address,
      city: item.city,
      state: item.state,
      zip_code: item.zip_code,
      category: getPrimaryCategory(item),
      status: item.status,
      is_searchable: item.is_searchable,
      data_status: item.data_status,
      missing_fields: item.missing_fields,
      is_hidden: item.is_hidden,
      last_quality_check_at: item.last_quality_check_at,
      is_claimed: item.is_claimed,
      claimed: item.claimed,
      claim_status: item.claim_status,
      claimed_at: item.claimed_at,
      claimed_by_email: item.claimed_by_email,
      owner_user_id: item.owner_user_id,
      rating: item.rating,
      view_count: item.view_count,
      click_count: item.click_count,
      theouthaven_score: item.theouthaven_score,
      roseout_score: item.roseout_score,
      quality_score: item.quality_score,
      trend_score: item.trend_score,
      conversion_score: item.conversion_score,
      review_score: item.review_score,
      popularity_score: item.popularity_score,
      ranking_badge: item.ranking_badge,
      main_image: item.main_image,
      image_url: item.image_url,
      images: item.images,
      created_at: item.created_at,
      quality_status: item.quality_status,
      has_photos: item.has_photos,
      photo_status: item.photo_status,
      is_low_level: item.is_low_level,
      low_level_reason: item.low_level_reason,
      public_visibility_tier: item.public_visibility_tier,
      curation_tier: item.curation_tier,
      source_quality_status: item.source_quality_status,
      import_confidence: item.import_confidence,
    })) || [];

  const allLocations = [...restaurantRows, ...activityRows].sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return dateB - dateA;
  });

  const totalFiltered =
    (shouldLoadRestaurants ? restaurantsResult.count || 0 : 0) +
    (shouldLoadActivities ? activitiesResult.count || 0 : 0);
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * pageSize;
  const to = from + allLocations.length;
  const locations = allLocations;

  const totalRestaurants = totalRestaurantsResult.count || 0;
  const totalActivities = totalActivitiesResult.count || 0;
  const totalAllLocations = totalRestaurants + totalActivities;

  const error = restaurantsResult.error || activitiesResult.error;

  return (
    <main
      data-page-version={ADMIN_LOCATIONS_VERSION}
      className="min-h-screen bg-[#090706] px-4 pb-10 pt-4 text-white sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-[1600px]">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_35%),linear-gradient(135deg,#160b0b,#090706_55%,#140f0a)] p-5 shadow-2xl sm:p-6">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.3em] text-rose-300">
                TheOutHaven Admin
              </p>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Locations
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                Manage restaurants and activities from one unified page. Filter
                by location type, approval status, claim status, address, city,
                zip, category, and performance.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/admin/dashboard/locations/new"
                className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:scale-[1.02]"
              >
                + Add Location
              </Link>
              <Link
                href="/admin/dashboard/crm"
                className="rounded-full border border-rose-300/30 bg-rose-500/15 px-5 py-3 text-sm font-black text-rose-100 hover:bg-rose-500/25"
              >
                Open CRM
              </Link>
              <Link
                href="/admin/dashboard/claim-qrs"
                className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
              >
                Print Claim QRs
              </Link>
              <Link href={buildQueryUrl({ q, type, status, claim, review: "low-level-hidden", page: 1, pageSize })} className="rounded-full border border-red-300/30 bg-red-500/15 px-5 py-3 text-sm font-black text-red-100 hover:bg-red-500/25">Low-Level Hidden</Link>
              <Link href={buildQueryUrl({ q, type, status, claim, review: "nyc-unverified", page: 1, pageSize })} className="rounded-full border border-amber-300/30 bg-amber-500/15 px-5 py-3 text-sm font-black text-amber-100 hover:bg-amber-500/25">NYC Unverified</Link>
              <Link href={buildQueryUrl({ q, type, status, claim, review: "missing-photos", page: 1, pageSize })} className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">Missing Photos</Link>
              <Link href={buildQueryUrl({ q, type, status, claim, review: "publish-ready", page: 1, pageSize })} className="rounded-full border border-emerald-300/30 bg-emerald-500/15 px-5 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-500/25">Publish Ready</Link>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 backdrop-blur">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
                  Showing
                </p>
                <p className="mt-1 text-3xl font-black">
                  {formatNumber(totalFiltered)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-5 rounded-3xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm font-bold text-rose-100">
            {error.message}
          </div>
        )}

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Total Locations
            </p>
            <p className="mt-2 text-3xl font-black">
              {formatNumber(totalAllLocations)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Restaurants
            </p>
            <p className="mt-2 text-3xl font-black text-rose-200">
              {formatNumber(totalRestaurants)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Activities
            </p>
            <p className="mt-2 text-3xl font-black text-purple-200">
              {formatNumber(totalActivities)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Current Filter
            </p>
            <p className="mt-2 text-3xl font-black">
              {formatNumber(totalFiltered)}
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-4 shadow-2xl">
          <form className="grid gap-3 lg:grid-cols-[1fr_170px_170px_170px_150px_120px]">
            <AdminLocationsSearchBox initialQuery={q} type={type} status={status} claim={claim} pageSize={pageSize} />

            <select
              name="type"
              defaultValue={type}
              className="h-11 rounded-full border border-white/10 bg-white/[0.07] px-5 text-sm font-bold text-white outline-none focus:border-rose-300"
            >
              <option className="text-black" value="all">
                All Types
              </option>
              <option className="text-black" value="restaurants">
                Restaurants
              </option>
              <option className="text-black" value="activities">
                Activities
              </option>
            </select>

            <select
              name="status"
              defaultValue={status}
              className="h-11 rounded-full border border-white/10 bg-white/[0.07] px-5 text-sm font-bold text-white outline-none focus:border-rose-300"
            >
              <option className="text-black" value="all">
                All Statuses
              </option>
              <option className="text-black" value="approved">
                Approved
              </option>
              <option className="text-black" value="pending">
                Pending
              </option>
              <option className="text-black" value="draft">
                Draft
              </option>
              <option className="text-black" value="rejected">
                Rejected
              </option>
            </select>

            <select
              name="claim"
              defaultValue={claim}
              className="h-11 rounded-full border border-white/10 bg-white/[0.07] px-5 text-sm font-bold text-white outline-none focus:border-rose-300"
            >
              <option className="text-black" value="all">
                All Claims
              </option>
              <option className="text-black" value="claimed">
                Claimed
              </option>
              <option className="text-black" value="unclaimed">
                Unclaimed
              </option>
            </select>

            <select
              name="pageSize"
              defaultValue={pageSize}
              className="h-11 rounded-full border border-white/10 bg-white/[0.07] px-5 text-sm font-bold text-white outline-none focus:border-rose-300"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} className="text-black" value={option}>
                  {option} / page
                </option>
              ))}
            </select>

            <input type="hidden" name="page" value="1" />

            <button
              type="submit"
              className="h-11 rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:scale-[1.02]"
            >
              Filter
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { label: "All", nextType: "all" },
              { label: "Restaurants", nextType: "restaurants" },
              { label: "Activities", nextType: "activities" },
            ].map((item) => (
              <Link
                key={item.nextType}
                href={buildQueryUrl({
                  q,
                  type: item.nextType,
                  status,
                  claim,
                  page: 1,
                  pageSize,
                })}
                className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide transition ${
                  type === item.nextType
                    ? "border-rose-400 bg-rose-500 text-white"
                    : "border-white/10 bg-white/[0.06] text-white/55 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}

            <span className="mx-1 hidden h-9 w-px bg-white/10 sm:block" />

            {["approved", "pending", "draft", "rejected"].map((item) => (
              <Link
                key={item}
                href={buildQueryUrl({
                  q,
                  type,
                  status: status === item ? "all" : item,
                  claim,
                  page: 1,
                  pageSize,
                })}
                className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide transition ${
                  status === item
                    ? "border-rose-400 bg-rose-500 text-white"
                    : "border-white/10 bg-white/[0.06] text-white/55 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item}
              </Link>
            ))}

            <span className="mx-1 hidden h-9 w-px bg-white/10 sm:block" />

            {["claimed", "unclaimed"].map((item) => (
              <Link
                key={item}
                href={buildQueryUrl({
                  q,
                  type,
                  status,
                  claim: claim === item ? "all" : item,
                  page: 1,
                  pageSize,
                })}
                className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide transition ${
                  claim === item
                    ? "border-rose-400 bg-rose-500 text-white"
                    : "border-white/10 bg-white/[0.06] text-white/55 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
          <div className="flex flex-col gap-3 border-b border-black/10 bg-[#fffaf6] p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black">Location Listings</h2>
              <p className="mt-1 text-xs font-medium text-black/50">
                Full address is visible directly in the admin list. Use View or
                Edit to manage each location.
              </p>
            </div>

            <div className="rounded-full bg-[#1b1210] px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white">
              Showing {totalFiltered ? from + 1 : 0}-
              {Math.min(to, totalFiltered)} of {formatNumber(totalFiltered)}
            </div>
          </div>

          {!locations.length ? (
            <div className="p-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-2xl">
                🌹
              </div>
              <p className="mt-4 text-lg font-black">No locations found</p>
              <p className="mt-1 text-sm text-black/50">
                Try changing the search or filters.
              </p>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {locations.map((location) => (
                <div
                  key={`${location.locationType}-${location.id}`}
                  className="group rounded-[1.5rem] border border-black/10 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-xl"
                >
                  <div className="grid gap-4 xl:grid-cols-[1fr_420px_140px] xl:items-center">
                    <Link
                      href={`/admin/dashboard/crm/${location.id}`}
                      className="flex min-w-0 items-center gap-4"
                    >
                      <div className="h-20 w-24 shrink-0 overflow-hidden rounded-[1.25rem] bg-[#eadfd8] shadow-sm">
                        {getLocationImage(location) ? (
                          <img
                            src={getLocationImage(location)}
                            alt={location.name || "TheOutHaven location"}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-black text-black/30">
                            RO
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-black">
                            {location.name || "Untitled Location"}
                          </h3>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${typeBadge(
                              location.locationType,
                            )}`}
                          >
                            {location.locationType === "restaurants"
                              ? "Restaurant"
                              : "Activity"}
                          </span>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${statusBadge(
                              location.status,
                            )}`}
                          >
                            {location.status || "unknown"}
                          </span>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${
                              isPubliclyVisible(location)
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {isPubliclyVisible(location)
                              ? "Searchable"
                              : getDataStatus(location)}
                          </span>
                        </div>

                        <p className="mt-1 line-clamp-2 text-sm font-bold text-black/55">
                          {formatFullAddress(location)}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full bg-[#f5eee8] px-3 py-1 text-[11px] font-black uppercase text-black/55">
                            {location.category || "Category N/A"}
                          </span>

                          <span
                            className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase ${
                              getIsClaimed(location)
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-black/10 bg-[#f5eee8] text-black/50"
                            }`}
                          >
                            {getIsClaimed(location) ? "Claimed" : "Open Claim"}
                          </span>

                          {getMissingFields(location).length > 0 && (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase text-amber-700">
                              Missing {getMissingFields(location).length}
                            </span>
                          )}

                          {location.is_hidden === true && (
                            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-black uppercase text-red-700">
                              Hidden
                            </span>
                          )}

                          {location.is_low_level === true && (
                            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-black uppercase text-red-700">
                              Low-Level: {location.low_level_reason || "review"}
                            </span>
                          )}

                          {location.source_quality_status && (
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase text-blue-700">
                              Source: {location.source_quality_status}
                            </span>
                          )}

                          {location.public_visibility_tier && (
                            <span className="rounded-full border border-black/10 bg-[#f5eee8] px-3 py-1 text-[11px] font-black uppercase text-black/50">
                              Tier: {location.public_visibility_tier}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>

                    <div className="grid grid-cols-4 gap-2">
                      <div className="rounded-2xl bg-[#f5eee8] p-3 text-center">
                        <p className="text-[10px] font-black uppercase tracking-wide text-black/35">
                          Rating
                        </p>
                        <p className="mt-1 text-sm font-black">
                          🌹 {location.rating || 0}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-[#f5eee8] p-3 text-center">
                        <p className="text-[10px] font-black uppercase tracking-wide text-black/35">
                          Views
                        </p>
                        <p className="mt-1 text-sm font-black">
                          {formatNumber(location.view_count)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-[#f5eee8] p-3 text-center">
                        <p className="text-[10px] font-black uppercase tracking-wide text-black/35">
                          Clicks
                        </p>
                        <p className="mt-1 text-sm font-black">
                          {formatNumber(location.click_count)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-[#1b1210] p-3 text-center text-white">
                        <p className="text-[10px] font-black uppercase tracking-wide text-white/40">
                          Score
                        </p>
                        <p className="mt-1 text-sm font-black">
                          {getLocationScore(location)}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 xl:flex-col">
                      <Link
                        href={`/admin/dashboard/crm/${location.id}`}
                        className="flex-1 rounded-full bg-[#1b1210] px-4 py-2 text-center text-xs font-black text-white transition hover:bg-rose-700"
                      >
                        Open in CRM
                      </Link>
                      <Link
                        href={`/admin/dashboard/locations/${location.locationType}/${location.id}`}
                        className="flex-1 rounded-full border border-black/10 bg-[#f5eee8] px-4 py-2 text-center text-xs font-black text-[#1b1210] transition hover:bg-[#1b1210] hover:text-white"
                      >
                        Legacy View
                      </Link>

                      <Link
                        href={`/admin/dashboard/locations/edit/${location.locationType}/${location.id}?from=/admin/dashboard/locations`}
                        className="flex-1 rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-4 py-2 text-center text-xs font-black text-white shadow-sm transition hover:scale-[1.03]"
                      >
                        Edit
                      </Link>

                      <Link
                        href={`/admin/dashboard/marketing?source_table=${location.locationType}&source_id=${location.id}&location_id=${location.id}&location_name=${encodeURIComponent(location.name || "Untitled Location")}&image=${encodeURIComponent(getLocationImage(location) || "")}&category=${encodeURIComponent(location.category || "")}&city=${encodeURIComponent(location.city || "")}&state=${encodeURIComponent(location.state || "")}&address=${encodeURIComponent(formatFullAddress(location))}&public_url=${encodeURIComponent(`/locations/${location.locationType}/${location.id}`)}`}
                        className="flex-1 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-center text-xs font-black text-rose-700 transition hover:bg-rose-600 hover:text-white"
                      >
                        Create Marketing
                      </Link>

                      {canImpersonate && (
                        location.owner_user_id ? (
                          <ImpersonateButton
                            targetType="location_owner"
                            locationId={location.id}
                            locationType={location.locationType}
                            userId={location.owner_user_id}
                            label="Log in as owner"
                            className="flex-1 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-black text-amber-800 transition hover:bg-amber-500 hover:text-white disabled:opacity-50"
                          />
                        ) : (
                          <span className="flex-1 rounded-full border border-black/10 bg-[#f5eee8] px-4 py-2 text-center text-xs font-black text-black/35">
                            No owner connected
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-5 flex items-center justify-between gap-4">
          <Link
            href={buildQueryUrl({
              q,
              type,
              status,
              claim,
              page: Math.max(1, safePage - 1),
              pageSize,
            })}
            className={`rounded-full px-5 py-3 text-sm font-black transition ${
              safePage <= 1
                ? "pointer-events-none border border-white/10 bg-white/[0.04] text-white/30"
                : "border border-white/10 bg-white text-black hover:scale-[1.02]"
            }`}
          >
            Previous
          </Link>

          <p className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/55">
            Page {safePage} of {totalPages}
          </p>

          <Link
            href={buildQueryUrl({
              q,
              type,
              status,
              claim,
              page: Math.min(totalPages, safePage + 1),
              pageSize,
            })}
            className={`rounded-full px-5 py-3 text-sm font-black transition ${
              safePage >= totalPages
                ? "pointer-events-none border border-white/10 bg-white/[0.04] text-white/30"
                : "bg-gradient-to-r from-rose-500 to-rose-700 text-white hover:scale-[1.02]"
            }`}
          >
            Next
          </Link>
        </div>
      </div>
    </main>
  );
}
