import Link from "next/link";
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

const ADMIN_DATA_QUALITY_VERSION = "admin-data-quality-2026-05-16";
const ADMIN_DATA_QUALITY_BASE_PATH = "/admin/dashboard/data-quality";

const SELECT_FIELDS =
  "id, name, restaurant_name, activity_name, location_type, primary_category, address, city, state, zip_code, latitude, longitude, main_image, image_url, images, is_searchable, data_status, missing_fields, is_hidden, status, quality_score, last_quality_check_at, updated_at";

type QualityFilter =
  | "all"
  | "clean"
  | "needs_review"
  | "missing_image"
  | "missing_coordinates"
  | "missing_address"
  | "hidden"
  | "closed";

type SearchParams = {
  filter?: string;
  q?: string;
};

type RawLocationRow = LocationVisibilityFields & {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  location_type?: string | null;
  primary_category?: string | null;
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
};

type QualityLocation = RawLocationRow & {
  locationType: "restaurant" | "activity";
  table: "restaurants" | "activities";
  displayName: string;
};

type FilterOption = {
  key: QualityFilter;
  label: string;
};

const filterOptions: FilterOption[] = [
  { key: "all", label: "All" },
  { key: "clean", label: "Clean" },
  { key: "needs_review", label: "Needs Review" },
  { key: "missing_image", label: "Missing Image" },
  { key: "missing_coordinates", label: "Missing Coordinates" },
  { key: "missing_address", label: "Missing Address" },
  { key: "hidden", label: "Hidden" },
  { key: "closed", label: "Closed" },
];

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not checked";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not checked";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getInferredMissingFields(location: QualityLocation) {
  const missing = new Set(getMissingFields(location));

  if (!cleanString(getLocationName(location, ""))) missing.add("name");
  if (!hasValue(location.primary_category)) missing.add("primary_category");
  if (!hasValue(location.address)) missing.add("address");
  if (!hasValue(location.city)) missing.add("city");
  if (!hasValue(location.state)) missing.add("state");
  if (!hasValue(location.zip_code)) missing.add("zip_code");
  if (!hasValue(location.latitude)) missing.add("latitude");
  if (!hasValue(location.longitude)) missing.add("longitude");

  const image = getLocationImage(location);
  if (!image || image === "/placeholder.jpg") missing.add("main_image");

  return Array.from(missing);
}

function getDisplayDataStatus(location: QualityLocation) {
  const helperStatus = getDataStatus(location);
  const inferredMissing = getInferredMissingFields(location);

  if (location.is_hidden === true) return "hidden";
  if (String(location.status || "").toLowerCase() === "closed") return "closed";
  if (helperStatus === "clean" && inferredMissing.length === 0) return "clean";
  if (helperStatus !== "clean") return helperStatus;
  if (inferredMissing.includes("main_image")) return "missing_image";
  if (inferredMissing.includes("latitude") || inferredMissing.includes("longitude")) {
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

  return "needs_review";
}

function formatDataStatus(status: string) {
  return normalizeMissingField(status);
}

function getStatusClass(status: string) {
  if (status === "clean") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "missing_image") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "missing_coordinates") return "border-orange-200 bg-orange-50 text-orange-700";
  if (status === "missing_address") return "border-yellow-200 bg-yellow-50 text-yellow-800";
  if (status === "hidden" || status === "closed") return "border-red-200 bg-red-50 text-red-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function isMissingAddress(location: QualityLocation) {
  const missing = getInferredMissingFields(location);
  return ["address", "city", "state", "zip_code"].some((field) => missing.includes(field));
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
  if (filter === "closed") return String(location.status || "").toLowerCase() === "closed";
  if (filter === "missing_image") return dataStatus === "missing_image" || isMissingImage(location);
  if (filter === "missing_coordinates") {
    return dataStatus === "missing_coordinates" || isMissingCoordinates(location);
  }
  if (filter === "missing_address") return dataStatus === "missing_address" || isMissingAddress(location);

  return dataStatus === "needs_review" || (location.is_searchable !== true && dataStatus !== "clean");
}

function buildFilterUrl(filter: QualityFilter, q: string) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (q) params.set("q", q);

  const query = params.toString();
  return query ? `${ADMIN_DATA_QUALITY_BASE_PATH}?${query}` : ADMIN_DATA_QUALITY_BASE_PATH;
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
    locationType: "restaurant",
    displayName: getLocationName(row, "Untitled restaurant"),
  };
}

function mapActivity(row: RawLocationRow): QualityLocation {
  return {
    ...row,
    table: "activities",
    locationType: "activity",
    displayName: getLocationName(row, "Untitled activity"),
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
  const activeFilter = filterOptions.some((option) => option.key === requestedFilter)
    ? (requestedFilter as QualityFilter)
    : "all";

  const [restaurantsResult, activitiesResult] = await Promise.all([
    supabase
      .from("restaurants")
      .select(SELECT_FIELDS)
      .order("last_quality_check_at", { ascending: true, nullsFirst: true })
      .order("updated_at", { ascending: false })
      .limit(1000),
    supabase
      .from("activities")
      .select(SELECT_FIELDS)
      .order("last_quality_check_at", { ascending: true, nullsFirst: true })
      .order("updated_at", { ascending: false })
      .limit(1000),
  ]);

  const restaurantRows = ((restaurantsResult.data || []) as RawLocationRow[]).map(mapRestaurant);
  const activityRows = ((activitiesResult.data || []) as RawLocationRow[]).map(mapActivity);
  const allLocations = [...restaurantRows, ...activityRows].sort((a, b) => {
    const dateA = a.last_quality_check_at || a.updated_at || "";
    const dateB = b.last_quality_check_at || b.updated_at || "";
    return dateA.localeCompare(dateB);
  });

  const searchedLocations = q
    ? allLocations.filter((location) => {
        const haystack = [
          location.displayName,
          location.locationType,
          location.city,
          location.state,
          location.address,
          location.primary_category,
          getDisplayDataStatus(location),
          ...getInferredMissingFields(location),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(q.toLowerCase());
      })
    : allLocations;

  const locations = searchedLocations.filter((location) => matchesFilter(location, activeFilter));

  const counts = {
    total: searchedLocations.length,
    clean: searchedLocations.filter((location) => getDisplayDataStatus(location) === "clean").length,
    missingImage: searchedLocations.filter(isMissingImage).length,
    missingCoordinates: searchedLocations.filter(isMissingCoordinates).length,
    missingAddress: searchedLocations.filter(isMissingAddress).length,
    needsReview: searchedLocations.filter((location) => matchesFilter(location, "needs_review")).length,
  };

  const error = restaurantsResult.error || activitiesResult.error;

  return (
    <main
      data-page-version={ADMIN_DATA_QUALITY_VERSION}
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
                Data Quality Dashboard
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
                Review restaurants and activities that are not searchable because
                required data is missing. This admin view intentionally includes
                incomplete, hidden, and closed listings so they can be fixed.
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

        <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["Total", counts.total, "text-white"],
            ["Clean", counts.clean, "text-emerald-200"],
            ["Missing image", counts.missingImage, "text-amber-200"],
            ["Missing coordinates", counts.missingCoordinates, "text-orange-200"],
            ["Missing address", counts.missingAddress, "text-yellow-200"],
            ["Needs review", counts.needsReview, "text-blue-200"],
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

        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-4 shadow-2xl">
          <form className="grid gap-3 lg:grid-cols-[1fr_120px]">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name, city, state, address, status, or missing field..."
              className="h-11 rounded-full border border-white/10 bg-white/[0.07] px-5 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-rose-300"
            />
            <input type="hidden" name="filter" value={activeFilter === "all" ? "" : activeFilter} />
            <button
              type="submit"
              className="h-11 rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:scale-[1.02]"
            >
              Search
            </button>
          </form>

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

        <section className="mt-5 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
          <div className="border-b border-black/10 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-black/40">
                  Quality queue
                </p>
                <h2 className="mt-1 text-xl font-black">
                  {formatNumber(locations.length)} listing{locations.length === 1 ? "" : "s"}
                </h2>
              </div>
              <p className="text-sm font-bold text-black/45">
                Sorted by oldest or missing quality check first.
              </p>
            </div>
          </div>

          <div className="hidden border-b border-black/10 bg-[#efe5dd] px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-black/40 lg:grid lg:grid-cols-[minmax(280px,1.4fr)_140px_190px_170px_150px_160px_160px_130px] lg:items-center">
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
              <p className="text-lg font-black">No locations match this filter.</p>
              <p className="mt-2 text-sm font-bold text-black/45">
                Try All or run cleanup to refresh quality metadata.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/10">
              {locations.map((location) => {
                const image = getLocationImage(location);
                const dataStatus = getDisplayDataStatus(location);
                const missingFields = getInferredMissingFields(location);
                const cityState = [location.city, location.state].filter(Boolean).join(", ") || "City/state missing";
                const isSearchable = location.is_searchable === true;

                return (
                  <article
                    key={`${location.table}-${location.id}`}
                    className="grid gap-4 p-4 transition hover:bg-white/70 lg:grid-cols-[minmax(280px,1.4fr)_140px_190px_170px_150px_160px_160px_130px] lg:items-center"
                  >
                    <div className="flex min-w-0 gap-3">
                      <div className="h-20 w-24 flex-none overflow-hidden rounded-2xl bg-[#eadfd8]">
                        {image ? (
                          <img
                            src={image}
                            alt={location.displayName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-black text-black/35">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black">
                          {location.displayName}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase ${typeBadgeClass(location.locationType)}`}>
                            {location.locationType}
                          </span>
                          <span className="rounded-full bg-[#efe5dd] px-3 py-1 text-[11px] font-black uppercase text-black/50">
                            {location.primary_category || "Category missing"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-bold text-black/50">
                          {cityState}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-black/35 lg:hidden">
                        Data status
                      </p>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase ${getStatusClass(dataStatus)}`}>
                        {formatDataStatus(dataStatus)}
                      </span>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-black/35 lg:hidden">
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
                        <span className="text-sm font-bold text-black/40">None</span>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-black/35 lg:hidden">
                        Searchable
                      </p>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase ${
                          isSearchable
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {isSearchable ? "Searchable" : "Not searchable"}
                      </span>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-black/35 lg:hidden">
                        Quality score
                      </p>
                      <p className="text-2xl font-black">
                        {formatNumber(location.quality_score)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-black/35 lg:hidden">
                        Last quality check
                      </p>
                      <p className="text-sm font-black text-black/65">
                        {formatDate(location.last_quality_check_at)}
                      </p>
                      <p className="mt-1 text-xs font-bold text-black/35">
                        Updated {formatDate(location.updated_at)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-black/35 lg:hidden">
                        Flags
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {location.is_hidden === true && (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-700">
                            Hidden
                          </span>
                        )}
                        {String(location.status || "").toLowerCase() === "closed" && (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-700">
                            Closed
                          </span>
                        )}
                        {location.status && String(location.status).toLowerCase() !== "closed" && (
                          <span className="rounded-full bg-[#efe5dd] px-2 py-1 text-[10px] font-black uppercase text-black/45">
                            {location.status}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 lg:flex-col">
                      <Link
                        href={`/locations/${location.table}/${location.id}?from=/admin/dashboard/data-quality`}
                        className="flex-1 rounded-full border border-black/10 bg-[#f5eee8] px-4 py-2 text-center text-xs font-black text-[#1b1210] transition hover:bg-[#1b1210] hover:text-white"
                      >
                        View
                      </Link>
                      <Link
                        href={`/admin/dashboard/locations/edit/${location.table}/${location.id}?from=/admin/dashboard/data-quality`}
                        className="flex-1 rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-4 py-2 text-center text-xs font-black text-white shadow-sm transition hover:scale-[1.03]"
                      >
                        Edit
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
