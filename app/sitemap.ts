import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
}

function safeDate(value?: string | null) {
  if (!value) return new Date();

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return new Date();

  return date;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const supabase = adminSupabase();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/create`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.95,
    },
    {
      url: `${siteUrl}/signup`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const { data: locations } = await supabase
    .from("locations")
    .select(
      "id, location_type, created_at, is_searchable, data_status, is_hidden, status, name, address, city, state, latitude, longitude, main_image",
    )
    .eq("is_searchable", true)
    .eq("data_status", "clean")
    .not("is_hidden", "is", true)
    .not("status", "in", '("closed","archived")')
    .limit(5000);

  const locationRoutes: MetadataRoute.Sitemap =
    locations
      ?.filter(
        (location: any) =>
          location.status !== "closed" && location.status !== "archived",
      )
      .map((location: any) => {
        const routeType =
          location.location_type === "restaurant" ? "restaurants" : "activities";

        return {
          url: `${siteUrl}/locations/${routeType}/${location.id}`,
          lastModified: safeDate(location.created_at),
          changeFrequency: "weekly",
          priority: location.location_type === "restaurant" ? 0.75 : 0.7,
        };
      }) || [];

  return [...staticRoutes, ...locationRoutes];
}