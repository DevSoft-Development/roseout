import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const MAX_LOCATION_URLS = 5000;
const LOCAL_SEO_ROUTES = [
  "/explore/queens",
  "/explore/brooklyn",
  "/explore/manhattan",
  "/explore/bronx",
  "/explore/staten-island",
  "/explore/long-island",
  "/explore/steak-restaurants",
  "/explore/brunch-spots",
  "/explore/hookah-lounges",
  "/explore/rooftop-restaurants",
  "/explore/date-night",
];

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function safeDate(value?: string | null) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function route(path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]): MetadataRoute.Sitemap[number] {
  const siteUrl = getSiteUrl();
  return {
    url: path === "/" ? siteUrl : `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const supabase = adminSupabase();

  const staticRoutes: MetadataRoute.Sitemap = [
    route("/", 1, "daily"),
    route("/explore", 0.95, "daily"),
    route("/create", 0.9, "daily"),
    route("/business", 0.8, "monthly"),
    route("/privacy", 0.3, "yearly"),
    route("/terms", 0.3, "yearly"),
    route("/contact", 0.5, "monthly"),
    ...LOCAL_SEO_ROUTES.map((path) => route(path, 0.72, "weekly")),
  ];

  const { data: locations } = await supabase
    .from("locations")
    .select("id, location_type, type, source_table, slug, updated_at, created_at, is_searchable, data_status, is_hidden, status, quality_status, duplicate_status, has_photos, photo_status, is_low_level, public_visibility_tier, curation_tier, source_quality_status, import_confidence")
    .eq("is_searchable", true)
    .eq("data_status", "clean")
    .eq("quality_status", "publish_ready")
    .or("duplicate_status.is.null,duplicate_status.neq.duplicate")
    .eq("has_photos", true)
    .not("photo_status", "eq", "missing_photo")
    .not("is_hidden", "is", true)
    .not("status", "in", '("closed","archived")')
    .or("is_low_level.is.null,is_low_level.eq.false")
    .not("public_visibility_tier", "in", '("low_level","hidden")')
    .not("curation_tier", "eq", "low_level")
    .not("source_quality_status", "in", '("imported_unverified","generic_restaurant","needs_enrichment","low_level_review")')
    .not("import_confidence", "eq", "low")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(MAX_LOCATION_URLS);

  const locationRoutes: MetadataRoute.Sitemap =
    locations
      ?.filter((location: any) => {
        const status = String(location.status || "").toLowerCase();
        return location.is_searchable === true && location.data_status === "clean" && location.is_hidden !== true && status !== "closed" && status !== "archived" && location.is_low_level !== true && !["low_level", "hidden"].includes(String(location.public_visibility_tier || "").toLowerCase()) && String(location.curation_tier || "").toLowerCase() !== "low_level" && !["imported_unverified", "generic_restaurant", "needs_enrichment", "low_level_review"].includes(String(location.source_quality_status || "").toLowerCase()) && String(location.import_confidence || "").toLowerCase() !== "low" && location.has_photos === true && location.photo_status !== "missing_photo";
      })
      .map((location: any) => {
        const rawType = String(location.location_type || location.type || location.source_table || "restaurant").toLowerCase();
        const routeType = rawType.includes("activity") ? "activities" : "restaurants";
        const identifier = location.slug || location.id;

        return {
          url: `${siteUrl}/locations/${routeType}/${identifier}`,
          lastModified: safeDate(location.updated_at || location.created_at),
          changeFrequency: "weekly",
          priority: routeType === "restaurants" ? 0.75 : 0.7,
        };
      }) || [];

  return [...staticRoutes, ...locationRoutes];
}
