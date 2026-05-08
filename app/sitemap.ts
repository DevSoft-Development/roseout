import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "https://theouthaven.com"
  ).replace(/\/$/, "");
}

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

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, updated_at, created_at, status")
    .or("status.eq.approved,status.eq.active,status.is.null")
    .limit(5000);

  const { data: activities } = await supabase
    .from("activities")
    .select("id, updated_at, created_at, status")
    .or("status.eq.approved,status.eq.active,status.is.null")
    .limit(5000);

  const restaurantRoutes: MetadataRoute.Sitemap =
    restaurants?.map((restaurant: any) => ({
      url: `${siteUrl}/locations/restaurants/${restaurant.id}`,
      lastModified: safeDate(restaurant.updated_at || restaurant.created_at),
      changeFrequency: "weekly",
      priority: 0.75,
    })) || [];

  const activityRoutes: MetadataRoute.Sitemap =
    activities?.map((activity: any) => ({
      url: `${siteUrl}/locations/activities/${activity.id}`,
      lastModified: safeDate(activity.updated_at || activity.created_at),
      changeFrequency: "weekly",
      priority: 0.7,
    })) || [];

  return [...staticRoutes, ...restaurantRoutes, ...activityRoutes];
}