import type { Metadata } from "next";
import Link from "next/link";
import AdminLocationsSearchBox from "./AdminLocationsSearchBox";
import ImpersonateButton from "@/components/admin/ImpersonateButton";
import FoodTermBackfillPanel from "../dashboard/locations/FoodTermBackfillPanel";
import HoursBackfillPanel from "../dashboard/locations/HoursBackfillPanel";
import GoogleEnrichmentPanel from "@/components/admin/locations/GoogleEnrichmentPanel";
import {
  AdminActionButton,
  AdminEmptyState,
  AdminFilterChip,
  AdminFilterGroup,
  AdminFilterPanel,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminPagination,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@/lib/admin-auth";
import { formatFullAddress as formatSharedFullAddress } from "@/lib/address-utils";
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

const ADMIN_LOCATIONS_VERSION = "admin-locations-refresh-2026-06-21-hours";
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
  tab?: string;
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

type AdminLocationRow = Partial<AdminLocation> &
  LocationClaimFields & {
    id: string;
    name?: string | null;
    restaurant_name?: string | null;
    activity_name?: string | null;
    location_type?: string | null;
    source_table?: string | null;
    category?: string | null;
  };

const FULL_LOCATION_SELECT = [
  "id",
  "name",
  "restaurant_name",
  "activity_name",
  "location_type",
  "source_table",
  "address",
  "city",
  "state",
  "zip_code",
  "status",
  "is_searchable",
  "data_status",
  "missing_fields",
  "is_hidden",
  "last_quality_check_at",
  "is_claimed",
  "claimed",
  "claim_status",
  "claimed_at",
  "claimed_by_email",
  "owner_user_id",
  "primary_category",
  "category",
  "cuisine",
  "cuisine_type",
  "food_type",
  "activity_type",
  "primary_tag",
  "phone",
  "google_place_id",
  "claim_code",
  "tags",
  "google_types",
  "rating",
  "review_count",
  "view_count",
  "click_count",
  "theouthaven_score",
  "roseout_score",
  "quality_score",
  "trend_score",
  "conversion_score",
  "review_score",
  "popularity_score",
  "ranking_badge",
  "main_image",
  "image_url",
  "images",
  "created_at",
  "quality_status",
  "has_photos",
  "photo_status",
  "is_low_level",
  "low_level_reason",
  "public_visibility_tier",
  "curation_tier",
  "source_quality_status",
  "import_confidence",
] as const;

const SAFE_LOCATION_SELECT = [
  "id",
  "name",
  "restaurant_name",
  "activity_name",
  "location_type",
  "source_table",
  "address",
  "city",
  "state",
  "zip_code",
  "status",
  "is_searchable",
  "data_status",
  "is_hidden",
  "primary_category",
  "category",
  "cuisine",
  "cuisine_type",
  "activity_type",
  "phone",
  "rating",
  "review_count",
  "main_image",
  "image_url",
  "images",
  "created_at",
] as const;

const FULL_LOCATION_COLUMNS = new Set<string>(FULL_LOCATION_SELECT);
const SAFE_LOCATION_COLUMNS = new Set<string>(SAFE_LOCATION_SELECT);

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function formatFullAddress(item: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}) {
  return formatSharedFullAddress({
    address: item.address,
    city: item.city,
    state: item.state,
    zip_code: item.zip_code,
    fallback: "Address not listed",
  });
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
  const activeTab = params.tab || "locations";

  if (activeTab === "google-enrichment") {
    return (
      <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-5 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px]">
          <section className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-6 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">
              Admin Locations
            </p>
            <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-4xl font-black tracking-tight">
                  Locations
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
                  Search, audit, and enrich TheOutHaven location metadata.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/dashboard/locations"
                  className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10"
                >
                  Locations
                </Link>
                <Link
                  href="/admin/dashboard/locations?tab=google-enrichment"
                  className="rounded-full border border-rose-300/40 bg-rose-500/20 px-5 py-3 text-sm font-black text-rose-100"
                >
                  Google Enrichment
                </Link>
              </div>
            </div>
          </section>
          <div className="mt-5">
            <GoogleEnrichmentPanel />
          </div>
        </div>
      </main>
    );
  }

  const q = params.q?.trim() || "";
  const safeQ = q.replace(/[%_,]/g, " ").trim();
  const type = params.type || "all";
  const status = params.status || "all";
  const claim = params.claim || "all";
  const review = params.review || "all";
  const page = Math.max(1, Number(params.page || 1));
  const requestedPageSize = Number(params.pageSize || 100);
  const pageSize = PAGE_SIZE_OPTIONS.includes(
    requestedPageSize as (typeof PAGE_SIZE_OPTIONS)[number],
  )
    ? requestedPageSize
    : 100;
  const queryFrom = (page - 1) * pageSize;
  const queryTo = queryFrom + pageSize - 1;

  const escapeSearchTerm = (value: string) =>
    value.replace(/[%,()]/g, " ").trim();

  const buildLocationsQuery = (safeMode: boolean) => {
    const selectedColumns = safeMode
      ? SAFE_LOCATION_SELECT
      : FULL_LOCATION_SELECT;
    const selectedColumnSet = safeMode
      ? SAFE_LOCATION_COLUMNS
      : FULL_LOCATION_COLUMNS;
    const warnings: string[] = [];

    let query = supabase
      .from("locations")
      .select(selectedColumns.join(", "), { count: "exact" })
      .order("created_at", { ascending: false })
      .range(queryFrom, queryTo);

    if (type === "restaurants") {
      query = query.or(
        "location_type.eq.restaurant,source_table.eq.restaurants,source_table.eq.restaurant",
      );
    }

    if (type === "activities") {
      query = query.or(
        "location_type.eq.activity,source_table.eq.activities,source_table.eq.activity",
      );
    }

    if (status !== "all" && selectedColumnSet.has("status")) {
      query = query.eq("status", status);
    }

    if (claim === "claimed") {
      if (
        selectedColumnSet.has("is_claimed") &&
        selectedColumnSet.has("claimed")
      ) {
        query = query.or(
          "is_claimed.eq.true,and(is_claimed.is.null,claimed.eq.true)",
        );
      } else {
        warnings.push(
          "Claim filtering is unavailable in safe mode because claim columns are missing.",
        );
      }
    }

    if (claim === "unclaimed") {
      if (
        selectedColumnSet.has("is_claimed") &&
        selectedColumnSet.has("claimed")
      ) {
        query = query.or(
          "is_claimed.eq.false,and(is_claimed.is.null,claimed.eq.false),and(is_claimed.is.null,claimed.is.null)",
        );
      } else {
        warnings.push(
          "Claim filtering is unavailable in safe mode because claim columns are missing.",
        );
      }
    }

    if (review === "low-level-hidden") {
      if (selectedColumnSet.has("is_low_level")) {
        query = query.eq("is_low_level", true);
      } else {
        warnings.push(
          "Low-level review filtering was skipped because is_low_level is missing.",
        );
      }
    }

    if (review === "nyc-unverified") {
      if (selectedColumnSet.has("low_level_reason")) {
        query = query.eq("low_level_reason", "nyc_import_unverified");
      } else {
        warnings.push(
          "NYC unverified filtering was skipped because low_level_reason is missing.",
        );
      }
    }

    if (review === "missing-photos") {
      if (
        selectedColumnSet.has("has_photos") &&
        selectedColumnSet.has("photo_status")
      ) {
        query = query.or("has_photos.eq.false,photo_status.eq.missing_photo");
      } else {
        warnings.push(
          "Missing photos filtering was skipped because photo quality columns are missing.",
        );
      }
    }

    if (review === "publish-ready") {
      if (selectedColumnSet.has("quality_status")) {
        query = query.eq("quality_status", "publish_ready");
      } else {
        warnings.push(
          "Publish-ready filtering was skipped because quality_status is missing.",
        );
      }
    }

    if (safeQ) {
      const searchColumns = [
        "name",
        "restaurant_name",
        "activity_name",
        "address",
        "city",
        "state",
        "zip_code",
        "phone",
        "primary_category",
        "category",
        "cuisine",
        "cuisine_type",
        "activity_type",
        "google_place_id",
        "claim_code",
      ].filter((column) => selectedColumnSet.has(column));
      const escapedQ = escapeSearchTerm(safeQ);
      if (escapedQ && searchColumns.length) {
        query = query.or(
          searchColumns
            .map((column) => `${column}.ilike.%${escapedQ}%`)
            .join(","),
        );
      }
    }

    return { query, warnings };
  };

  const fullQuery = buildLocationsQuery(false);
  let locationsResult = await fullQuery.query;
  let safeMode = false;
  let safeModeWarnings = [...fullQuery.warnings];

  if (locationsResult.error) {
    safeMode = true;
    const fallbackQuery = buildLocationsQuery(true);
    locationsResult = await fallbackQuery.query;
    safeModeWarnings = [
      "Some optional admin quality columns are missing, so the locations page is using safe mode.",
      ...fallbackQuery.warnings,
    ];
  }

  const buildTypeCountQuery = (kind: "restaurants" | "activities") => {
    let query = supabase
      .from("locations")
      .select("id", { count: "exact", head: true });
    if (kind === "restaurants") {
      query = query.or(
        "location_type.eq.restaurant,source_table.eq.restaurants,source_table.eq.restaurant",
      );
    } else {
      query = query.or(
        "location_type.eq.activity,source_table.eq.activities,source_table.eq.activity",
      );
    }
    return query;
  };

  const [totalLocationsResult, totalRestaurantsResult, totalActivitiesResult] =
    await Promise.all([
      supabase.from("locations").select("id", { count: "exact", head: true }),
      buildTypeCountQuery("restaurants"),
      buildTypeCountQuery("activities"),
    ]);

  const locations: AdminLocation[] = (
    (locationsResult.data as AdminLocationRow[] | null) || []
  ).map((item) => {
    const sourceType = String(
      item.source_table || item.location_type || "",
    ).toLowerCase();
    const locationType: "restaurants" | "activities" = sourceType.includes(
      "restaurant",
    )
      ? "restaurants"
      : sourceType.includes("activit")
        ? "activities"
        : item.restaurant_name
          ? "restaurants"
          : "activities";

    return {
      id: item.id,
      locationType,
      name:
        getLocationName(item, "") ||
        item.name ||
        item.restaurant_name ||
        item.activity_name ||
        (locationType === "restaurants"
          ? "Untitled restaurant"
          : "Untitled activity"),
      address: item.address || null,
      city: item.city || null,
      state: item.state || null,
      zip_code: item.zip_code || null,
      category:
        getPrimaryCategory(item) ||
        item.primary_category ||
        item.category ||
        item.cuisine ||
        item.cuisine_type ||
        item.activity_type ||
        null,
      primary_category: item.primary_category,
      cuisine: item.cuisine,
      cuisine_type: item.cuisine_type,
      food_type: item.food_type,
      activity_type: item.activity_type,
      primary_tag: item.primary_tag,
      tags: item.tags,
      google_types: item.google_types,
      status: item.status || null,
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
      rating: item.rating || null,
      view_count: item.view_count || null,
      click_count: item.click_count || null,
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
      created_at: item.created_at || null,
      quality_status: item.quality_status,
      has_photos: item.has_photos,
      photo_status: item.photo_status,
      is_low_level: item.is_low_level,
      low_level_reason: item.low_level_reason,
      public_visibility_tier: item.public_visibility_tier,
      curation_tier: item.curation_tier,
      source_quality_status: item.source_quality_status,
      import_confidence: item.import_confidence,
    };
  });

  const totalFiltered = locationsResult.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * pageSize;
  const to = from + locations.length;

  const totalRestaurants = totalRestaurantsResult.count || 0;
  const totalActivities = totalActivitiesResult.count || 0;
  const totalAllLocations = totalLocationsResult.count || 0;

  const error = locationsResult.error;

  const staleHoursBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ count: missingHoursCount }, { count: staleHoursCount }] = await Promise.all([
    supabase.from("locations").select("id", { count: "exact", head: true }).eq("is_searchable", true).not("google_place_id", "is", null).is("hours_last_backfilled_at", null),
    supabase.from("locations").select("id", { count: "exact", head: true }).eq("is_searchable", true).not("google_place_id", "is", null).lt("hours_last_backfilled_at", staleHoursBefore),
  ]);

  const operations = [
    {
      title: "Import & Maintenance",
      body: "Run import, cleanup, dedupe, publish, photo, QR, and history tools.",
      href: "/admin/dashboard/locations/import",
      accent: "rose",
    },
    {
      title: "Google Enrichment",
      body: "Queue and review Google enrichment work for location records.",
      href: "/admin/dashboard/locations/google-enrichment",
      accent: "blue",
    },
    {
      title: "Non-Searchable Review",
      body: "Audit hidden, low-level, and non-searchable location records.",
      href: "/admin/dashboard/locations/non-searchable",
      accent: "amber",
    },
    {
      title: "Duplicate Review",
      body: "Review live duplicate location pairs and safely merge/hide duplicate public rows.",
      href: "/admin/dashboard/locations/duplicates",
      accent: "rose",
    },
    {
      title: "Data Quality",
      body: "Review data quality issues and cleanup opportunities.",
      href: "/admin/dashboard/data-quality",
      accent: "green",
    },
    {
      title: "Search Health",
      body: "Validate search quality and ranking behavior.",
      href: "/admin/dashboard/search-health",
      accent: "blue",
    },
    {
      title: "Claim QR Tools",
      body: "Print and repair QR codes used for claim workflows.",
      href: "/admin/dashboard/claim-qrs",
      accent: "muted",
    },
  ];

  return (
    <AdminPageShell>
      <div data-page-version={ADMIN_LOCATIONS_VERSION} className="max-w-full min-w-0 overflow-x-hidden">
        <AdminPageHeader
          eyebrow="TheOutHaven Admin"
          title="Locations"
          subtitle="Manage restaurants and activities from one enterprise workspace. Search, audit, enrich, and maintain listing health without changing database behavior."
          badge={<AdminStatusBadge tone="rose">{formatNumber(totalFiltered)} showing</AdminStatusBadge>}
          actions={
            <>
              <AdminActionButton href="/admin/dashboard/locations/new" variant="primary">Add Location</AdminActionButton>
              <AdminActionButton href="/admin/dashboard/locations/import" variant="primary">Import / Maintenance</AdminActionButton>
              <AdminActionButton href="/admin/dashboard/crm">Open CRM</AdminActionButton>
              <AdminActionButton href="/admin/dashboard/locations/non-searchable">Review Non-Searchable</AdminActionButton>
              <AdminActionButton href="/admin/dashboard/locations/duplicates">Duplicate Review</AdminActionButton>
              <AdminActionButton href="/admin/dashboard/locations/google-enrichment" variant="ghost">Google Enrichment</AdminActionButton>
            </>
          }
        />

        {safeMode && (
          <AdminSectionCard className="border-amber-300/25 bg-amber-500/10 p-5 text-sm font-bold text-amber-100">
            <p>Some optional admin quality columns are missing and the page is using safe mode. Core location data is still available.</p>
            {safeModeWarnings.length > 1 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-100/80">
                {Array.from(new Set(safeModeWarnings.slice(1))).map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
          </AdminSectionCard>
        )}

        {error && <AdminSectionCard className="border-red-300/25 bg-red-500/10 p-5 text-sm font-bold text-red-100">{error.message}</AdminSectionCard>}

        <AdminKpiGrid>
          <AdminKpiCard label="Total Locations" value={formatNumber(totalAllLocations)} helper="All live location records" />
          <AdminKpiCard label="Restaurants" value={formatNumber(totalRestaurants)} helper="Restaurant records" />
          <AdminKpiCard label="Activities" value={formatNumber(totalActivities)} helper="Activity records" />
          <AdminKpiCard label="Current Filter" value={formatNumber(totalFiltered)} helper={`Page ${safePage} of ${totalPages}`} />
        </AdminKpiGrid>

        <AdminSectionCard className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Location Operations</p>
              <h2 className="mt-2 text-2xl font-black text-white">Import, enrichment, cleanup, dedupe, publish, QR, and quality tools</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Run the existing maintenance workflows from the locations section while keeping the original import center route available.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AdminActionButton href="/admin/dashboard/locations/duplicates" variant="ghost">Duplicate Review</AdminActionButton>
              <AdminActionButton href="/admin/dashboard/claim-qrs" variant="ghost">Print Claim QRs</AdminActionButton>
              <AdminActionButton href={buildQueryUrl({ q, type, status, claim, review: "low-level-hidden", page: 1, pageSize })} variant="ghost">Low-Level Hidden</AdminActionButton>
              <AdminActionButton href={buildQueryUrl({ q, type, status, claim, review: "nyc-unverified", page: 1, pageSize })} variant="ghost">NYC Unverified</AdminActionButton>
              <AdminActionButton href={buildQueryUrl({ q, type, status, claim, review: "missing-photos", page: 1, pageSize })} variant="ghost">Missing Photos</AdminActionButton>
              <AdminActionButton href={buildQueryUrl({ q, type, status, claim, review: "publish-ready", page: 1, pageSize })} variant="ghost">Publish Ready</AdminActionButton>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {operations.map((item) => (
              <Link key={item.href} href={item.href} className="group min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-rose-300/35 hover:bg-white/[0.06]">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-black text-white">{item.title}</h3>
                  <AdminStatusBadge tone={item.accent as "rose" | "green" | "amber" | "red" | "blue" | "muted"}>Open</AdminStatusBadge>
                </div>
                <p className="mt-2 text-sm leading-6 text-white/55">{item.body}</p>
              </Link>
            ))}
          </div>
        </AdminSectionCard>

        <AdminFilterPanel>
          <form className="grid max-w-full gap-3 lg:grid-cols-[minmax(0,1fr)_170px_170px_170px_150px_120px]">
            <div className="min-w-0"><AdminLocationsSearchBox initialQuery={q} type={type} status={status} claim={claim} pageSize={pageSize} /></div>
            <select name="type" defaultValue={type} className="h-11 min-w-0 rounded-xl border border-white/10 bg-[#0b0b0d] px-4 text-sm font-bold text-white outline-none focus:border-rose-300"><option className="text-black" value="all">All Types</option><option className="text-black" value="restaurants">Restaurants</option><option className="text-black" value="activities">Activities</option></select>
            <select name="status" defaultValue={status} className="h-11 min-w-0 rounded-xl border border-white/10 bg-[#0b0b0d] px-4 text-sm font-bold text-white outline-none focus:border-rose-300"><option className="text-black" value="all">All Statuses</option><option className="text-black" value="approved">Approved</option><option className="text-black" value="pending">Pending</option><option className="text-black" value="draft">Draft</option><option className="text-black" value="rejected">Rejected</option></select>
            <select name="claim" defaultValue={claim} className="h-11 min-w-0 rounded-xl border border-white/10 bg-[#0b0b0d] px-4 text-sm font-bold text-white outline-none focus:border-rose-300"><option className="text-black" value="all">All Claims</option><option className="text-black" value="claimed">Claimed</option><option className="text-black" value="unclaimed">Unclaimed</option></select>
            <select name="pageSize" defaultValue={pageSize} className="h-11 min-w-0 rounded-xl border border-white/10 bg-[#0b0b0d] px-4 text-sm font-bold text-white outline-none focus:border-rose-300">{PAGE_SIZE_OPTIONS.map((option) => <option key={option} className="text-black" value={option}>{option} / page</option>)}</select>
            <input type="hidden" name="page" value="1" />
            <AdminActionButton type="submit" variant="primary">Filter</AdminActionButton>
          </form>
          <div className="mt-5 grid gap-4 xl:grid-cols-4">
            <AdminFilterGroup label="Type">
              {[{ label: "All", value: "all" }, { label: "Restaurants", value: "restaurants" }, { label: "Activities", value: "activities" }].map((item) => <AdminFilterChip key={item.value} active={type === item.value} href={buildQueryUrl({ q, type: item.value, status, claim, review, page: 1, pageSize })}>{item.label}</AdminFilterChip>)}
            </AdminFilterGroup>
            <AdminFilterGroup label="Status">
              {["approved", "pending", "draft", "rejected"].map((item) => <AdminFilterChip key={item} active={status === item} href={buildQueryUrl({ q, type, status: status === item ? "all" : item, claim, review, page: 1, pageSize })}>{item}</AdminFilterChip>)}
            </AdminFilterGroup>
            <AdminFilterGroup label="Claim">
              {["claimed", "unclaimed"].map((item) => <AdminFilterChip key={item} active={claim === item} href={buildQueryUrl({ q, type, status, claim: claim === item ? "all" : item, review, page: 1, pageSize })}>{item}</AdminFilterChip>)}
            </AdminFilterGroup>
            <AdminFilterGroup label="Review">
              {[
                ["low-level-hidden", "Low-Level Hidden"],
                ["nyc-unverified", "NYC Unverified"],
                ["missing-photos", "Missing Photos"],
                ["publish-ready", "Publish Ready"],
              ].map(([value, label]) => <AdminFilterChip key={value} active={review === value} href={buildQueryUrl({ q, type, status, claim, review: review === value ? "all" : value, page: 1, pageSize })}>{label}</AdminFilterChip>)}
            </AdminFilterGroup>
          </div>
        </AdminFilterPanel>

        <FoodTermBackfillPanel />
        <HoursBackfillPanel missingCount={missingHoursCount} staleCount={staleHoursCount} />

        <AdminSectionCard>
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-black text-white">Location Listings</h2>
              <p className="mt-1 text-xs font-medium text-white/50">Showing {totalFiltered ? from + 1 : 0}-{Math.min(to, totalFiltered)} of {formatNumber(totalFiltered)}. Use CRM, View, Edit, Marketing, and owner access actions per record.</p>
            </div>
            <AdminStatusBadge tone="muted">Page {safePage} / {totalPages}</AdminStatusBadge>
          </div>
          {!locations.length ? (
            <div className="p-5"><AdminEmptyState title="No locations found" body="Try changing the search or filters." action={<AdminActionButton href={buildQueryUrl({ q: "", type: "all", status: "all", claim: "all", review: "all", page: 1, pageSize })}>Clear filters</AdminActionButton>} /></div>
          ) : (
            <div className="space-y-3 p-4">
              {locations.map((location) => {
                const image = getLocationImage(location);
                return (
                  <article key={`${location.locationType}-${location.id}`} className="group min-w-0 rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-3 transition hover:border-rose-300/30 hover:bg-white/[0.055]">
                    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,420px)] xl:items-start">
                      <Link href={`/admin/dashboard/crm/${location.id}`} className="flex min-w-0 flex-col gap-4 sm:flex-row">
                        <div className="h-24 w-full shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/30 sm:w-28">
                          {image ? <img src={image} alt={location.name || "TheOutHaven location"} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <div className="flex h-full w-full items-center justify-center text-sm font-black text-white/25">TOH</div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="min-w-0 truncate text-lg font-black text-white">{location.name || "Untitled Location"}</h3>
                            <AdminStatusBadge tone={location.locationType === "restaurants" ? "rose" : "blue"}>{location.locationType === "restaurants" ? "Restaurant" : "Activity"}</AdminStatusBadge>
                            <AdminStatusBadge tone={location.status === "approved" ? "green" : location.status === "pending" ? "amber" : location.status === "rejected" ? "red" : "muted"}>{location.status || "unknown"}</AdminStatusBadge>
                            <AdminStatusBadge tone={isPubliclyVisible(location) ? "green" : "amber"}>{isPubliclyVisible(location) ? "Searchable" : getDataStatus(location)}</AdminStatusBadge>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm font-semibold text-white/55">{formatFullAddress(location)}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <AdminStatusBadge tone="muted">{location.category || "Category N/A"}</AdminStatusBadge>
                            <AdminStatusBadge tone={getIsClaimed(location) ? "green" : "muted"}>{getIsClaimed(location) ? "Claimed" : "Open Claim"}</AdminStatusBadge>
                            {getMissingFields(location).length > 0 && <AdminStatusBadge tone="amber">Missing {getMissingFields(location).length}</AdminStatusBadge>}
                            {location.is_hidden === true && <AdminStatusBadge tone="red">Hidden</AdminStatusBadge>}
                            {location.is_low_level === true && <AdminStatusBadge tone="red">Low-Level: {location.low_level_reason || "review"}</AdminStatusBadge>}
                            {location.source_quality_status && <AdminStatusBadge tone="blue">Source: {location.source_quality_status}</AdminStatusBadge>}
                            {location.public_visibility_tier && <AdminStatusBadge tone="muted">Tier: {location.public_visibility_tier}</AdminStatusBadge>}
                          </div>
                        </div>
                      </Link>
                      <div className="min-w-0 space-y-3">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {[["Rating", location.rating || 0], ["Views", formatNumber(location.view_count)], ["Clicks", formatNumber(location.click_count)], ["Score", getLocationScore(location)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-3 text-center"><p className="text-[10px] font-black uppercase tracking-wide text-white/35">{label}</p><p className="mt-1 text-sm font-black text-white">{value}</p></div>)}
                        </div>
                        <div className="flex min-w-0 flex-wrap gap-2 border-t border-white/10 pt-3">
                          <AdminActionButton href={`/admin/dashboard/crm/${location.id}`} variant="primary">Open in CRM</AdminActionButton>
                          <AdminActionButton href={`/admin/dashboard/locations/${location.locationType}/${location.id}`}>View</AdminActionButton>
                          <AdminActionButton href={`/admin/dashboard/locations/edit/${location.locationType}/${location.id}?from=/admin/dashboard/locations`}>Edit</AdminActionButton>
                          <AdminActionButton href={`/admin/dashboard/marketing?source_table=${location.locationType}&source_id=${location.id}&location_id=${location.id}&location_name=${encodeURIComponent(location.name || "Untitled Location")}&image=${encodeURIComponent(image || "")}&category=${encodeURIComponent(location.category || "")}&city=${encodeURIComponent(location.city || "")}&state=${encodeURIComponent(location.state || "")}&address=${encodeURIComponent(formatFullAddress(location))}&public_url=${encodeURIComponent(`/locations/${location.locationType}/${location.id}`)}`}>Marketing</AdminActionButton>
                          {canImpersonate && (location.owner_user_id ? <ImpersonateButton targetType="location_owner" locationId={location.id} locationType={location.locationType} userId={location.owner_user_id} label="Log in as owner" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-300/25 bg-amber-500/10 px-4 py-2 text-sm font-black text-amber-100 hover:bg-amber-500/20 disabled:opacity-50" /> : <span className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-white/35">No owner connected</span>)}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </AdminSectionCard>

        <AdminPagination>
          <AdminActionButton href={buildQueryUrl({ q, type, status, claim, review, page: Math.max(1, safePage - 1), pageSize })} variant={safePage <= 1 ? "ghost" : "secondary"}>Previous</AdminActionButton>
          <span className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/55">Page {safePage} of {totalPages}</span>
          <AdminActionButton href={buildQueryUrl({ q, type, status, claim, review, page: Math.min(totalPages, safePage + 1), pageSize })} variant={safePage >= totalPages ? "ghost" : "primary"}>Next</AdminActionButton>
        </AdminPagination>
      </div>
    </AdminPageShell>
  );
}
