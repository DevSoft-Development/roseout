import "server-only";

import type { BusinessWebsite } from "@/lib/websites/data";
import type { GeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import type { WebsiteArtifactFile } from "@/lib/websites/publish-contract";
import { getWebsiteLiveUrl } from "@/lib/websites/platform-domain";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function pagePath(filePath: string) {
  if (filePath === "index.html") return "/";
  return `/${filePath.replace(/index\.html$/, "")}`;
}

function absoluteUrl(base: string | null, path: string) {
  return base ? new URL(path, `${base}/`).toString() : null;
}

function pageLabel(path: string) {
  if (path === "/") return null;
  const label = path.replace(/^\/+|\/+$/g, "").split("/").pop() || "";
  return label.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function structuredBusinessType(location: GeneratedWebsiteLocationSnapshot) {
  if (location.menu) return "Restaurant";
  if (location.events.length || location.experiences.length) return "EntertainmentBusiness";
  return "LocalBusiness";
}

function pageDescription(path: string, name: string, location: GeneratedWebsiteLocationSnapshot, fallback: string) {
  const label = pageLabel(path);
  if (!label) return fallback;
  if (path.startsWith("/menu")) return `Explore the current menu at ${name}.`;
  if (path.startsWith("/reservations")) return `Reserve your visit to ${name}.`;
  if (path.startsWith("/events")) return `See upcoming events and experiences at ${name}.`;
  if (path.startsWith("/gallery")) return `See photos and highlights from ${name}.`;
  if (path.startsWith("/reviews")) return `Read verified guest reviews for ${name}.`;
  if (path.startsWith("/about")) return `Learn more about ${name}.`;
  if (path.startsWith("/visit") || path.startsWith("/contact")) return `Find hours, contact information, and directions for ${name}.`;
  return `${label} at ${name}.`;
}

function eventSchema(location: GeneratedWebsiteLocationSnapshot, base: string | null) {
  return location.events.slice(0, 6).map((event) => ({
    "@type": "Event",
    name: event.title,
    startDate: event.starts_at,
    ...(event.description ? { description: event.description } : {}),
    ...(event.image_url ? { image: event.image_url } : {}),
    location: {
      "@type": "Place",
      name: location.name || location.title || "Venue",
      ...(location.address ? { address: { "@type": "PostalAddress", streetAddress: location.address } } : {}),
    },
    ...(base ? { url: new URL(`/events/${event.slug || event.id}`, "https://theouthaven.com").toString() } : {}),
    ...(event.is_free ? { isAccessibleForFree: true } : {}),
  }));
}

function enhanceHtml(input: string, canonicalUrl: string | null, website: BusinessWebsite, location: GeneratedWebsiteLocationSnapshot, path: string) {
  const name = location.name || location.title || website.site_title || "Business";
  const existingTitle = input.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || name;
  const label = pageLabel(path);
  const title = label ? `${label} | ${name}` : existingTitle.includes(name) ? existingTitle : `${existingTitle} | ${name}`;
  const existingDescription = input.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || `Visit ${name}.`;
  const description = pageDescription(path, name, location, existingDescription);
  const image = location.image_url || location.photos[0] || null;
  const businessId = canonicalUrl ? `${canonicalUrl.replace(/\/$/, "")}#business` : undefined;
  const structured = {
    "@context": "https://schema.org",
    "@type": structuredBusinessType(location),
    ...(businessId ? { "@id": businessId } : {}),
    name,
    ...(canonicalUrl ? { url: canonicalUrl } : {}),
    ...(image ? { image } : {}),
    ...(location.phone ? { telephone: location.phone } : {}),
    ...(location.address ? { address: { "@type": "PostalAddress", streetAddress: location.address } } : {}),
    ...(location.reservation_link ? { potentialAction: { "@type": "ReserveAction", target: location.reservation_link } } : {}),
  };
  const graph = [structured, ...eventSchema(location, canonicalUrl)];

  const social = [
    canonicalUrl ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">` : "",
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    canonicalUrl ? `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">` : "",
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : "",
    `<script type="application/ld+json">${escapeJson({ "@context": "https://schema.org", "@graph": graph.map(({ ["@context"]: _context, ...item }) => item) })}</script>`,
  ].filter(Boolean).join("");

  let html = input
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta[^>]+name=["']description["'][^>]*>/i, `<meta name="description" content="${escapeHtml(description)}">`)
    .replace("</head>", `${social}<style>.toh-skip-link{position:fixed;left:12px;top:12px;z-index:9999;transform:translateY(-180%);background:var(--text);color:var(--bg);padding:10px 14px;border-radius:8px;font:800 13px/1 var(--body)}.toh-skip-link:focus{transform:none}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--accent);outline-offset:3px}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto!important}}</style></head>`);
  html = html.replace(/<body([^>]*)>/i, `<body$1><a class="toh-skip-link" href="#main-content">Skip to content</a>`);
  html = html.replace(/<main(?![^>]*id=)([^>]*)>/i, `<main id="main-content"$1>`);

  let firstImage = true;
  html = html.replace(/<img([^>]*)>/gi, (match, attrs: string) => {
    const withoutLoading = attrs.replace(/\sloading=["'][^"']*["']/gi, "").replace(/\sfetchpriority=["'][^"']*["']/gi, "").replace(/\sdecoding=["'][^"']*["']/gi, "");
    if (firstImage) {
      firstImage = false;
      return `<img${withoutLoading} loading="eager" fetchpriority="high" decoding="async">`;
    }
    return `<img${withoutLoading} loading="lazy" decoding="async">`;
  });
  html = html.replace(/<iframe(?![^>]*loading=)([^>]+)>/gi, `<iframe loading="lazy"$1>`);
  html = html.replace(/<html([^>]*)>/i, `<html$1 data-page-path="${escapeHtml(path)}">`);
  return html;
}

export function enhanceWebsiteSeoAccessibility(files: WebsiteArtifactFile[], website: BusinessWebsite, location: GeneratedWebsiteLocationSnapshot): WebsiteArtifactFile[] {
  const base = getWebsiteLiveUrl(website);
  const htmlFiles = files.map((file) => {
    if (!file.content || !file.path.endsWith(".html")) return file;
    const path = pagePath(file.path);
    return { ...file, content: enhanceHtml(file.content, absoluteUrl(base, path), website, location, path) };
  });

  if (!base) return htmlFiles;
  const pages = htmlFiles.filter((file) => file.path.endsWith("index.html")).map((file) => absoluteUrl(base, pagePath(file.path))).filter(Boolean) as string[];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((url) => `<url><loc>${escapeHtml(url)}</loc></url>`).join("")}</urlset>`;
  const robots = `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
  return htmlFiles.concat([
    { path: "sitemap.xml", content: sitemap, contentType: "application/xml; charset=utf-8", encoding: "utf8" },
    { path: "robots.txt", content: robots, contentType: "text/plain; charset=utf-8", encoding: "utf8" },
  ]);
}
