import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import DataQualitySearchBox from "./DataQualitySearchBox";
import CleanupActions from "./CleanupActions";
import { requireAdminRole } from "@/lib/admin-auth";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationName } from "@/lib/locationName";
import {
  getDataStatus,
  getMissingFields,
  type LocationVisibilityFields,
} from "@/lib/locationVisibility";
import { supabase } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Data Quality",
  description: "Audit location visibility and missing data.",
};

const ADMIN_DATA_QUALITY_VERSION = "admin-data-quality-2026-05-17";
const ADMIN_DATA_QUALITY_BASE_PATH = "/admin/dashboard/data-quality";
const LOCATION_SAFE_ORDER_COLUMN = "id";

const RESTAURANT_SELECT =
  "id, name, restaurant_name, location_type, primary_category, cuisine, cuisine_type, food_type, primary_tag, phone, google_place_id, claim_code, address, city, state, zip_code, latitude, longitude, main_image, image_url, images, is_searchable, data_status, missing_fields, is_hidden, is_verified, status, quality_score, last_quality_check_at, updated_at, created_at";

const ACTIVITY_SELECT =
  "id, name, activity_name, location_type, primary_category, activity_type, primary_tag, phone, google_place_id, claim_code, address, city, state, zip_code, latitude, longitude, main_image, image_url, images, is_searchable, data_status, missing_fields, is_hidden, is_verified, status, quality_score, last_quality_check_at, created_at";

const LOCATION_SELECT =
  "id, name, restaurant_name, activity_name, location_type, source_table, source_id, primary_category, cuisine, cuisine_type, activity_type, primary_tag, phone, google_place_id, claim_code, address, city, state, zip_code, latitude, longitude, main_image, image_url, images, is_searchable, data_status, missing_fields, is_hidden, is_verified, status, quality_score, last_quality_check_at, created_at";

type QualityFilter =
  | "all"
  | "clean"
  | "needs_review"
  | "missing_image"
  | "missing_category"
  | "missing_coordinates"
  | "missing_address"
  | "hidden"
  | "closed";

type SearchParams = {
  filter?: string;
  q?: string;
  page?: string;
};

type RawLocationRow = LocationVisibilityFields & {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  location_type?: string | null;
  source_table?: string | null;
  source_id?: string | null;
  primary_category?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  food_type?: string | null;
  activity_type?: string | null;
  phone?: string | null;
  google_place_id?: string | null;
  claim_code?: string | null;
  primary_tag?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  main_image?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  quality_score?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type QualityLocation = RawLocationRow & {
  locationType: "restaurant" | "activity";
  table: "restaurants" | "activities" | "locations";
  detailType: "restaurants" | "activities";
  detailId: string;
  displayName: string;
};

type FilterOption = {
  key: QualityFilter;
  label: string;
};

const filterOptions: FilterOption[] = [
  { key: "all", label: "All" },
  { key: "clean", label: "Search Ready" },
  { key: "needs_review", label: "Pending Review" },
  { key: "missing_image", label: "Missing Image" },
  { key: "missing_category", label: "Missing Category" },
  { key: "missing_coordinates", label: "Missing Coordinates" },
  { key: "missing_address", label: "Missing Address" },
  { key: "hidden", label: "Hidden from Search" },
  { key: "closed", label: "Closed" },
];

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Pending Review";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Pending Review";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatRelativeDate(value: string | null | undefined, prefix: string) {
  if (!value) return "Pending Review";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Pending Review";

  const diffMs = Date.now() - date.getTime();
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absMs < minute) return `${prefix} just now`;

  const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [day, "day"],
    [hour, "hour"],
    [minute, "minute"],
  ];

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const [unitMs, unit] = units.find(([size]) => absMs >= size) || [
    minute,
    "minute",
  ];
  const amount = Math.round(diffMs / unitMs) * -1;

  return `${prefix} ${formatter.format(amount, unit)}`;
}

function cleanString(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasValue(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function normalizeMissingField(field: string) {
  if (field === "main_image") return "Main Image";
  if (field === "primary_category") return "Primary Category";
  if (field === "zip_code") return "ZIP Code";

  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getPrimaryCategory(location: QualityLocation | RawLocationRow) {
  return (
    cleanString(location.primary_category) ||
    cleanString(
      (location as RawLocationRow & { cuisine?: string | null }).cuisine,
    ) ||
    cleanString(
      (location as RawLocationRow & { cuisine_type?: string | null })
        .cuisine_type,
    ) ||
    cleanString(
      (location as RawLocationRow & { activity_type?: string | null })
        .activity_type,
    ) ||
    cleanString(
      (location as RawLocationRow & { primary_tag?: string | null })
        .primary_tag,
    ) ||
    null
  );
}

function getMainImage(location: QualityLocation | RawLocationRow) {
  const image = getLocationImage(location);
  return image && image !== "/placeholder.jpg" ? image : null;
}

function getUpdatedDate(record: RawLocationRow) {
  return record.updated_at || record.created_at || null;
}

function getQualityScoreClass(score: number | null | undefined) {
  const value = Number(score || 0);

  if (value >= 90) {
    return "border-rose-100/40 bg-gradient-to-br from-rose-500 via-[#b61f3a] to-[#6f151f] text-white shadow-rose-950/20";
  }

  if (value >= 75) {
    return "border-[#e7c987]/60 bg-gradient-to-br from-[#fff2ce] via-[#e7c987] to-[#b9873e] text-[#2a170e] shadow-amber-950/10";
  }

  if (value >= 50) {
    return "border-[#d89055]/60 bg-gradient-to-br from-[#f1c38f] to-[#a95f31] text-[#2a170e]";
  }

  return "border-[#b84b55]/50 bg-gradient-to-br from-[#7d1e2b] to-[#3a1217] text-white";
}

function isClosedLocation(location: QualityLocation) {
  const status = String(location.status || "").toLowerCase();
  return status === "closed" || status === "archived";
}

function needsVerification(location: QualityLocation, missingFields: string[]) {
  return (
    missingFields.includes("latitude") ||
    missingFields.includes("longitude") ||
    missingFields.includes("address") ||
    missingFields.includes("city") ||
    missingFields.includes("state") ||
    missingFields.includes("zip_code") ||
    getDisplayDataStatus(location) === "missing_coordinates" ||
    getDisplayDataStatus(location) === "missing_address"
  );
}

function getQualityStatusLabel(
  location: QualityLocation,
  inferredMissingFields: string[],
) {
  const storedMissingFields = getMissingFields(location);

  if (isClosedLocation(location)) return "Closed";
  if (location.is_hidden === true) return "Hidden from Search";
  if (storedMissingFields.length > 0) return "Needs Completion";
  if (needsVerification(location, inferredMissingFields))
    return "Needs Verification";
  if (
    location.is_searchable === true &&
    getDisplayDataStatus(location) === "clean"
  ) {
    return "Search Ready";
  }
  if (!location.last_quality_check_at) return "Pending Review";

  return "Pending Review";
}

function getQualityStatusHelper(label: string) {
  if (label === "Pending Review") {
    return "Imported recently and not fully verified yet.";
  }

  return null;
}

function getSearchableLabel(
  location: QualityLocation,
  missingFields: string[],
) {
  return getQualityStatusLabel(location, missingFields);
}

function getInferredMissingFields(location: QualityLocation) {
  const missing = new Set(getMissingFields(location));

  if (!cleanString(getLocationName(location, ""))) missing.add("name");
  if (!getPrimaryCategory(location)) missing.add("primary_category");
  if (!hasValue(location.address)) missing.add("address");
  if (!hasValue(location.city)) missing.add("city");
  if (!hasValue(location.state)) missing.add("state");
  if (!hasValue(location.zip_code)) missing.add("zip_code");
  if (!hasValue(location.latitude)) missing.add("latitude");
  if (!hasValue(location.longitude)) missing.add("longitude");

  if (!getMainImage(location)) missing.add("main_image");

  if (getPrimaryCategory(location)) missing.delete("primary_category");
  if (getMainImage(location)) missing.delete("main_image");
  if (cleanString(getLocationName(location, ""))) missing.delete("name");

  return Array.from(missing);
}

function getDisplayDataStatus(location: QualityLocation) {
  const helperStatus = getDataStatus(location);
  const inferredMissing = getInferredMissingFields(location);

  if (location.is_hidden === true) return "hidden";
  if (isClosedLocation(location)) return "closed";
  if (helperStatus === "clean" && inferredMissing.length === 0) return "clean";
  if (inferredMissing.includes("main_image")) return "missing_image";
  if (inferredMissing.includes("primary_category")) return "missing_category";
  if (
    inferredMissing.includes("latitude") ||
    inferredMissing.includes("longitude")
  ) {
    return "missing_coordinates";
  }
  if (
    inferredMissing.includes("address") ||
    inferredMissing.includes("city") ||
    inferredMissing.includes("state") ||
    inferredMissing.includes("zip_code")
  ) {
    return "missing_address";
  }

  if (helperStatus !== "clean" && helperStatus !== "needs_review")
    return helperStatus;

  return "needs_review";
}

function formatDataStatus(status: string) {
  const labels: Record<string, string> = {
    clean: "Search Ready",
    missing_image: "Needs Completion",
    missing_category: "Needs Completion",
    missing_coordinates: "Needs Verification",
    missing_address: "Needs Verification",
    hidden: "Hidden from Search",
    closed: "Closed",
    needs_review: "Pending Review",
  };

  return labels[status] || normalizeMissingField(status);
}

function getStatusClass(status: string) {
  if (status === "clean") return "border-[#d9bd7c] bg-[#fff4d6] text-[#3b2512]";
  if (status === "missing_image")
    return "border-[#d9a45f] bg-[#fff0dc] text-[#7b421f]";
  if (status === "missing_category")
    return "border-[#d9bd7c] bg-[#f6ead2] text-[#5b3d18]";
  if (status === "missing_coordinates")
    return "border-[#c8794b] bg-[#f7dfcf] text-[#783c24]";
  if (status === "missing_address")
    return "border-[#d19d71] bg-[#f6e4d5] text-[#6d3d24]";
  if (status === "hidden" || status === "closed")
    return "border-[#aa3b46] bg-[#f5d9dc] text-[#7b1f2b]";
  return "border-[#b86b78] bg-[#f2dce0] text-[#6f2131]";
}

function isMissingAddress(location: QualityLocation) {
  const missing = getInferredMissingFields(location);
  return ["address", "city", "state", "zip_code"].some((field) =>
    missing.includes(field),
  );
}

function isMissingCoordinates(location: QualityLocation) {
  const missing = getInferredMissingFields(location);
  return missing.includes("latitude") || missing.includes("longitude");
}

function isMissingImage(location: QualityLocation) {
  return getInferredMissingFields(location).includes("main_image");
}

function matchesFilter(location: QualityLocation, filter: QualityFilter) {
  const dataStatus = getDisplayDataStatus(location);

  if (filter === "all") return true;
  if (filter === "clean") return dataStatus === "clean";
  if (filter === "hidden") return location.is_hidden === true;
  if (filter === "closed") return isClosedLocation(location);
  if (filter === "missing_image")
    return dataStatus === "missing_image" || isMissingImage(location);
  if (filter === "missing_category") {
    return (
      dataStatus === "missing_category" ||
      getInferredMissingFields(location).includes("primary_category")
    );
  }
  if (filter === "missing_coordinates") {
    return (
      dataStatus === "missing_coordinates" || isMissingCoordinates(location)
    );
  }
  if (filter === "missing_address")
    return dataStatus === "missing_address" || isMissingAddress(location);

  return (
    dataStatus === "needs_review" ||
    (location.is_searchable !== true && dataStatus !== "clean")
  );
}

function buildFilterUrl(filter: QualityFilter, q: string) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (q) params.set("q", q);

  const query = params.toString();
  return query
    ? `${ADMIN_DATA_QUALITY_BASE_PATH}?${query}`
    : ADMIN_DATA_QUALITY_BASE_PATH;
}

function typeBadgeClass(type: QualityLocation["locationType"]) {
  return type === "restaurant"
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : "border-purple-200 bg-purple-50 text-purple-700";
}

function mapRestaurant(row: RawLocationRow): QualityLocation {
  return {
    ...row,
    table: "restaurants",
    detailType: "restaurants",
    detailId: row.id,
    locationType: "restaurant",
    displayName: getLocationName(row, "Untitled restaurant"),
  };
}

function mapActivity(row: RawLocationRow): QualityLocation {
  return {
    ...row,
    table: "activities",
    detailType: "activities",
    detailId: row.id,
    locationType: "activity",
    displayName: getLocationName(row, "Untitled activity"),
  };
}

function mapLocation(row: RawLocationRow): QualityLocation {
  const isActivity =
    row.source_table === "activities" ||
    row.location_type === "activity" ||
    Boolean(row.activity_name);
  return {
    ...row,
    table: "locations",
    detailType: isActivity ? "activities" : "restaurants",
    detailId: row.source_id || row.id,
    locationType: isActivity ? "activity" : "restaurant",
    displayName: getLocationName(row, "Untitled location"),
  };
}

export default async function AdminDataQualityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  const params = await searchParams;
  const q = params.q?.trim() || "";
  const requestedFilter = params.filter || "all";
  const page = Math.max(1, Number(params.page || 1) || 1);
  const pageSize = 60;
  const rangeTo = page * pageSize - 1;
  const activeFilter = filterOptions.some(
    (option) => option.key === requestedFilter,
  )
    ? (requestedFilter as QualityFilter)
    : "all";

  const searchTerm = q.replace(/[%_,]/g, " ").trim();
  const restaurantSearchFields = [
    "name",
    "restaurant_name",
    "address",
    "city",
    "state",
    "neighborhood",
    "phone",
    "primary_category",
    "cuisine",
    "cuisine_type",
    "primary_tag",
    "google_place_id",
    "claim_code",
    "data_status",
  ];
  const activitySearchFields = [
    "name",
    "activity_name",
    "address",
    "city",
    "state",
    "neighborhood",
    "phone",
    "primary_category",
    "activity_type",
    "primary_tag",
    "google_place_id",
    "claim_code",
    "data_status",
  ];
  const locationSearchFields = [
    "name",
    "restaurant_name",
    "activity_name",
    "address",
    "city",
    "state",
    "neighborhood",
    "phone",
    "primary_category",
    "cuisine",
    "cuisine_type",
    "activity_type",
    "primary_tag",
    "google_place_id",
    "claim_code",
    "data_status",
  ];
  const applySearch = <T extends { or: (filters: string) => T }>(
    query: T,
    fields: string[],
  ) => {
    if (!searchTerm) return query;
    const pattern = `%${searchTerm}%`;
    return query.or(
      fields.map((field) => `${field}.ilike.${pattern}`).join(","),
    );
  };

  const [restaurantsResult, activitiesResult, locationsResult] =
    await Promise.all([
      applySearch(
        supabase
          .from("restaurants")
          .select(RESTAURANT_SELECT)
          .order("last_quality_check_at", { ascending: true, nullsFirst: true })
          .order("updated_at", { ascending: false })
          .range(0, rangeTo),
        restaurantSearchFields,
      ),
      applySearch(
        supabase
          .from("activities")
          .select(ACTIVITY_SELECT)
          .order("last_quality_check_at", { ascending: true, nullsFirst: true })
          .order("created_at", { ascending: false })
          .range(0, rangeTo),
        activitySearchFields,
      ),
      applySearch(
        supabase
          .from("locations")
          .select(LOCATION_SELECT)
          .order("last_quality_check_at", { ascending: true, nullsFirst: true })
          .order(LOCATION_SAFE_ORDER_COLUMN, { ascending: false })
          .range(0, rangeTo),
        locationSearchFields,
      ),
    ]);

  const restaurantRows = (
    (restaurantsResult.data || []) as RawLocationRow[]
  ).map(mapRestaurant);
  const activityRows = ((activitiesResult.data || []) as RawLocationRow[]).map(
    mapActivity,
  );
  const locationRows = ((locationsResult.data || []) as RawLocationRow[]).map(
    mapLocation,
  );
  const allLocations = [
    ...locationRows,
    ...restaurantRows,
    ...activityRows,
  ].sort((a, b) => {
    const dateA = a.last_quality_check_at || getUpdatedDate(a) || "";
    const dateB = b.last_quality_check_at || getUpdatedDate(b) || "";
    return dateA.localeCompare(dateB);
  });

  const searchedLocations = allLocations;

  const locations = searchedLocations.filter((location) =>
    matchesFilter(location, activeFilter),
  );

  const counts = {
    total: searchedLocations.length,
    clean: searchedLocations.filter(
      (location) => getDisplayDataStatus(location) === "clean",
    ).length,
    missingImage: searchedLocations.filter(isMissingImage).length,
    missingCategory: searchedLocations.filter((location) =>
      getInferredMissingFields(location).includes("primary_category"),
    ).length,
    missingCoordinates: searchedLocations.filter(isMissingCoordinates).length,
    missingAddress: searchedLocations.filter(isMissingAddress).length,
    needsReview: searchedLocations.filter((location) =>
      matchesFilter(location, "needs_review"),
    ).length,
  };

  const error =
    restaurantsResult.error || activitiesResult.error || locationsResult.error;

  return (
    <main
      data-page-version={ADMIN_DATA_QUALITY_VERSION}
      className="min-h-screen overflow-x-hidden bg-[#090706] px-4 pb-10 pt-4 text-white sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-[1600px] overflow-x-hidden">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_35%),linear-gradient(135deg,#160b0b,#090706_55%,#140f0a)] p-5 shadow-2xl sm:p-6">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.3em] text-rose-300">
                TheOutHaven Admin
              </p>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Data Quality Dashboard
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
                Review locations, restaurants, and activities that are not
                searchable because required data is missing. This admin view
                intentionally includes incomplete, hidden, and closed listings
                so they can be fixed.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
                Showing
              </p>
              <p className="mt-1 text-3xl font-black">
                {formatNumber(locations.length)}
              </p>
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-5 rounded-3xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm font-bold text-rose-100">
            {error.message}
          </div>
        )}

        <section className="mt-5 grid max-w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
          {[
            ["Total", counts.total, "text-white"],
            ["Search Ready", counts.clean, "text-[#f5dd9d]"],
            ["Missing image", counts.missingImage, "text-[#e7b979]"],
            ["Missing category", counts.missingCategory, "text-[#d9bd7c]"],
            [
              "Missing coordinates",
              counts.missingCoordinates,
              "text-[#d89055]",
            ],
            ["Missing address", counts.missingAddress, "text-[#e4c4a9]"],
            ["Pending review", counts.needsReview, "text-[#e7a0ad]"],
          ].map(([label, value, tone]) => (
            <div
              key={String(label)}
              className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl"
            >
              <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
                {label}
              </p>
              <p className={`mt-2 text-3xl font-black ${tone}`}>
                {formatNumber(value as number)}
              </p>
            </div>
          ))}
        </section>

        <CleanupActions />

        <section className="mt-5 max-w-full rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-4 shadow-2xl">
          <DataQualitySearchBox initialQuery={q} activeFilter={activeFilter} />

          <div className="mt-4 flex flex-wrap gap-2">
            {filterOptions.map((option) => (
              <Link
                key={option.key}
                href={buildFilterUrl(option.key, q)}
                className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide transition ${
                  activeFilter === option.key
                    ? "border-rose-400 bg-rose-500 text-white"
                    : "border-white/10 bg-white/[0.06] text-white/55 hover:bg-white/10 hover:text-white"
                }`}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-5 max-w-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
          <div className="border-b border-black/10 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-black/40">
                  Quality queue
                </p>
                <h2 className="mt-1 text-xl font-black">
                  {formatNumber(locations.length)} listing
                  {locations.length === 1 ? "" : "s"}
                </h2>
              </div>
              <p className="text-sm font-bold text-black/45">
                Sorted by oldest or missing quality check first.
              </p>
            </div>
          </div>

          <div className="hidden border-b border-black/10 bg-[#efe5dd] px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-black/40 2xl:grid xl:grid xl:grid-cols-[minmax(260px,1.4fr)_120px_160px_145px_90px_140px_110px_105px] xl:items-center">
            <span>Name / Type / City, State / Image</span>
            <span>Data status</span>
            <span>Missing fields</span>
            <span>Is searchable</span>
            <span>Quality score</span>
            <span>Last quality check</span>
            <span>Visibility</span>
            <span>Edit / View</span>
          </div>

          {locations.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-lg font-black">
                No locations match this filter.
              </p>
              <p className="mt-2 text-sm font-bold text-black/45">
                Try All or run cleanup to refresh quality metadata.
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-black/10">
                {locations.map((location) => {
                  const image = getMainImage(location);
                  const dataStatus = getDisplayDataStatus(location);
                  const missingFields = getInferredMissingFields(location);
                  const primaryCategory = getPrimaryCategory(location);
                  const cityState =
                    [location.city, location.state]
                      .filter(Boolean)
                      .join(", ") || "City/state missing";
                  const isSearchable = location.is_searchable === true;
                  const updatedDate = getUpdatedDate(location);
                  const qualityStatusLabel = getQualityStatusLabel(
                    location,
                    missingFields,
                  );
                  const qualityStatusHelper =
                    getQualityStatusHelper(qualityStatusLabel);

                  return (
                    <article
                      key={`${location.table}-${location.id}`}
                      className="grid gap-3 p-3 transition hover:bg-white/70 rounded-3xl border border-black/10 bg-white/45 shadow-sm 2xl:rounded-none 2xl:border-0 2xl:bg-transparent 2xl:shadow-none xl:grid xl:grid-cols-[minmax(260px,1.4fr)_120px_160px_145px_90px_140px_110px_105px] xl:items-center"
                    >
                      <div className="flex min-w-0 gap-3">
                        <div className="h-[76px] w-[76px] flex-none overflow-hidden rounded-xl bg-[#eadfd8]">
                          {image ? (
                            <Image
                              src={image}
                              alt={location.displayName}
                              width={88}
                              height={88}
                              unoptimized
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-black text-black/35">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-base font-black">
                            {location.displayName}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${typeBadgeClass(location.locationType)}`}
                            >
                              {location.locationType}
                            </span>
                            <span className="rounded-full bg-[#efe5dd] px-2 py-0.5 text-[10px] font-black uppercase text-black/50">
                              {primaryCategory || "Category missing"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-bold text-black/50">
                            {cityState}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-black/35 xl:hidden">
                          Data status
                        </p>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${getStatusClass(dataStatus)}`}
                        >
                          {qualityStatusLabel}
                        </span>
                        {qualityStatusHelper && (
                          <p className="mt-1 text-xs font-bold text-black/45">
                            {qualityStatusHelper}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-black/35 xl:hidden">
                          Missing fields
                        </p>
                        {missingFields.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {missingFields.slice(0, 4).map((field) => (
                              <span
                                key={field}
                                className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase text-amber-800"
                              >
                                {normalizeMissingField(field)}
                              </span>
                            ))}
                            {missingFields.length > 4 && (
                              <span className="rounded-full bg-black/10 px-2 py-1 text-[10px] font-black uppercase text-black/50">
                                +{missingFields.length - 4}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm font-bold text-black/40">
                            None
                          </span>
                        )}
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-black/35 xl:hidden">
                          Searchable
                        </p>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
                            isSearchable && dataStatus === "clean"
                              ? "border-[#d9bd7c] bg-[#fff4d6] text-[#3b2512]"
                              : location.is_hidden === true
                                ? "border-[#aa3b46] bg-[#f5d9dc] text-[#7b1f2b]"
                                : "border-[#d9a45f] bg-[#fff0dc] text-[#7b421f]"
                          }`}
                        >
                          {getSearchableLabel(location, missingFields)}
                        </span>
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-black/35 xl:hidden">
                          Quality score
                        </p>
                        <p
                          className={`inline-flex min-w-12 justify-center rounded-full border px-2.5 py-1 text-sm font-black ${getQualityScoreClass(location.quality_score)}`}
                        >
                          {formatNumber(location.quality_score)}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-black/35 xl:hidden">
                          Last quality check
                        </p>
                        <p className="text-sm font-black text-black/65">
                          {formatRelativeDate(
                            location.last_quality_check_at,
                            "Checked",
                          )}
                        </p>
                        {updatedDate && (
                          <p
                            className="mt-1 text-xs font-bold text-black/35"
                            title={formatDate(updatedDate)}
                          >
                            {formatRelativeDate(updatedDate, "Updated")}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-black/35 xl:hidden">
                          Flags
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {location.is_hidden === true && (
                            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-700">
                              Hidden
                            </span>
                          )}
                          {String(location.status || "").toLowerCase() ===
                            "closed" && (
                            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-700">
                              Closed
                            </span>
                          )}
                          {location.status &&
                            String(location.status).toLowerCase() !==
                              "closed" && (
                              <span className="rounded-full bg-[#efe5dd] px-2 py-1 text-[10px] font-black uppercase text-black/45">
                                {location.status}
                              </span>
                            )}
                        </div>
                      </div>

                      <div className="flex gap-1.5 xl:flex-col">
                        <Link
                          href={`/admin/dashboard/locations/${location.detailId}?from=/admin/dashboard/data-quality`}
                          className="flex-1 rounded-full border border-black/10 bg-[#f5eee8] px-3 py-1.5 text-center text-[11px] font-black text-[#1b1210] transition hover:bg-[#1b1210] hover:text-white"
                        >
                          View CRM
                        </Link>
                        <Link
                          href={`/admin/dashboard/locations/edit/${location.detailType}/${location.detailId}?from=/admin/dashboard/data-quality`}
                          className="flex-1 rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-3 py-1.5 text-center text-[11px] font-black text-white shadow-sm transition hover:scale-[1.03]"
                        >
                          Edit
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
              {locations.length >= page * pageSize && (
                <div className="border-t border-black/10 bg-[#efe5dd] p-4 text-center">
                  <Link
                    href={`${buildFilterUrl(activeFilter, q)}${buildFilterUrl(activeFilter, q).includes("?") ? "&" : "?"}page=${page + 1}`}
                    className="inline-flex rounded-full border border-black/10 bg-white px-5 py-2 text-xs font-black uppercase tracking-wide text-[#1b1210] transition hover:bg-[#1b1210] hover:text-white"
                  >
                    Load more results
                  </Link>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
