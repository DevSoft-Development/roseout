import type { Metadata } from "next";
import { buildSiteUrl, getSiteUrl } from "@/lib/site-url";

export const SITE_NAME = "TheOutHaven";
export const DEFAULT_TITLE = "TheOutHaven | Discover NYC & Long Island Outings";
export const DEFAULT_DESCRIPTION =
  "TheOutHaven helps people discover restaurants, activities, and curated outing ideas across New York City and Long Island.";
export const DEFAULT_OG_IMAGE = "/og-image.svg";

const PRIVATE_PATH_PREFIXES = [
  "/admin",
  "/dashboard",
  "/owner",
  "/business/dashboard",
  "/account",
  "/settings",
  "/auth/callback",
  "/auth/create-password",
  "/forgot-password",
  "/reset-password",
  "/api",
  "/internal",
  "/debug",
];

export type SeoPageInput = {
  title?: string;
  description?: string;
  path?: string;
  image?: string | null;
  noIndex?: boolean;
  type?: "website" | "article";
};

export function buildPageTitle(title?: string | null) {
  const clean = String(title || "").trim();
  return clean ? `${clean} | ${SITE_NAME}` : DEFAULT_TITLE;
}

export function buildDescription(...parts: Array<string | null | undefined>) {
  const description = parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");

  return (description || DEFAULT_DESCRIPTION).slice(0, 160);
}

export function canonicalUrl(path = "/") {
  return buildSiteUrl(path.split("#")[0] || "/");
}

export function openGraphImage(image?: string | null) {
  const candidate = String(image || "").trim();
  if (!candidate) return canonicalUrl(DEFAULT_OG_IMAGE);
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) return candidate;
  if (candidate.startsWith("/")) return canonicalUrl(candidate);
  return canonicalUrl(`/${candidate}`);
}

export function safeSlug(value: string) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function localSeoDescription({
  area,
  category,
  count,
}: {
  area?: string | null;
  category?: string | null;
  count?: number;
}) {
  const areaText = area ? ` in ${area}` : " across New York City and Long Island";
  const categoryText = category || "restaurants, activities, and outing ideas";
  const countText = typeof count === "number" && count > 0 ? ` Browse ${count} searchable locations` : " Browse searchable locations";

  return buildDescription(
    `Discover ${categoryText}${areaText} with TheOutHaven.`,
    `${countText} with local context, categories, and planning links.`,
  );
}

export function shouldNoIndex(path?: string | null) {
  const cleanPath = `/${String(path || "").replace(/^\/+/, "")}`.toLowerCase().replace(/\/+$/, "");
  return PRIVATE_PATH_PREFIXES.some((prefix) => cleanPath === prefix || cleanPath.startsWith(`${prefix}/`));
}

export function noIndexRobots(): Metadata["robots"] {
  return {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  };
}

export function buildMetadata({ title, description, path = "/", image, noIndex, type = "website" }: SeoPageInput = {}): Metadata {
  const pageTitle = title ? buildPageTitle(title) : DEFAULT_TITLE;
  const pageDescription = buildDescription(description);
  const canonical = canonicalUrl(path);
  const ogImage = openGraphImage(image);
  const privatePage = noIndex ?? shouldNoIndex(path);

  return {
    metadataBase: new URL(getSiteUrl()),
    applicationName: SITE_NAME,
    title: pageTitle,
    description: pageDescription,
    alternates: { canonical },
    openGraph: {
      type,
      siteName: SITE_NAME,
      title: pageTitle,
      description: pageDescription,
      url: canonical,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${SITE_NAME} outing discovery` }],
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: pageDescription,
      images: [ogImage],
    },
    robots: privatePage
      ? noIndexRobots()
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

export function organizationJsonLd() {
  const url = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url,
    logo: canonicalUrl("/icon.svg"),
    description: DEFAULT_DESCRIPTION,
  };
}

export function websiteJsonLd() {
  const url = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url,
    potentialAction: {
      "@type": "SearchAction",
      target: `${url}/create?prompt={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  };
}

export function jsonLdScript(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
