import { getSiteUrl } from "@/lib/site-url";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/explore", "/create", "/business", "/about", "/support", "/privacy", "/terms", "/contact", "/locations/"],
        disallow: [
          "/admin/",
          "/dashboard/",
          "/owner/",
          "/business/dashboard/",
          "/account/",
          "/settings/",
          "/user/",
          "/location-owner/",
          "/reserve/dashboard/",
          "/api/",
          "/auth/callback/",
          "/auth/create-password/",
          "/forgot-password",
          "/reset-password",
          "/internal/",
          "/debug/",
          "/beta/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
