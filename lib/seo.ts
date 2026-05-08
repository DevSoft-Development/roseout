import type { Metadata } from "next";

export const siteName = "TheOutHaven";
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://www.theouthaven.com";

export const defaultDescription =
  "Plan date nights, birthdays, dinners, activities, and unforgettable outings faster with TheOutHaven's AI-powered recommendations.";

const defaultKeywords = [
  "outing planner",
  "date night planner",
  "restaurant recommendations",
  "activity recommendations",
  "AI outing planner",
  "TheOutHaven",
];

type SeoOptions = {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  keywords?: string[];
  noIndex?: boolean;
};

export function createMetadata({
  title,
  description = defaultDescription,
  path = "/",
  image = "/hero-outing.jpg",
  keywords = [],
  noIndex = false,
}: SeoOptions): Metadata {
  const canonicalPath = path.startsWith("/") ? path : `/${path}`;

  return {
    title,
    description,
    keywords: [...defaultKeywords, ...keywords],
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      siteName,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
          googleBot: {
            index: false,
            follow: false,
          },
        }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
  };
}
