import "server-only";

import { lookup } from "node:dns/promises";
import net from "node:net";

export type CrawledWebsitePage = {
  url: string;
  path: string;
  title: string | null;
  description: string | null;
  canonical: string | null;
  headings: string[];
  assets: string[];
  forms: number;
  downloads: string[];
  social_links: string[];
  schema_types: string[];
};

export type WebsiteMigrationManifest = {
  source_url: string;
  crawled_pages: CrawledWebsitePage[];
  page_count: number;
  asset_count: number;
  form_count: number;
  downloads: string[];
  social_links: string[];
  schema_types: string[];
  redirect_map: Array<{ from: string; to: string }>;
  homepage_html: string;
};

const MAX_PAGES = 12;
const MAX_PAGE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 6_000_000;
const USER_AGENT = "TheOutHaven Website Migration/1.2";

function isPrivateIp(ip: string) {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const value = ip.toLowerCase();
  return value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd");
}

export async function assertPublicWebsiteUrl(raw: string) {
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error("unsupported_website_protocol");
  if (!url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("private_website_host");
  if (net.isIP(url.hostname) && isPrivateIp(url.hostname)) throw new Error("private_website_host");
  const answers = await lookup(url.hostname, { all: true });
  if (!answers.length || answers.some((answer) => isPrivateIp(answer.address))) throw new Error("private_website_host");
  return url;
}

function cleanText(value: string | null | undefined) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function matchOne(html: string, pattern: RegExp) {
  return cleanText(html.match(pattern)?.[1] || null) || null;
}

function absolute(value: string, base: URL) {
  try { return new URL(value, base); } catch { return null; }
}

function sameSite(hostname: string, root: string) {
  return hostname === root || hostname === `www.${root}` || root === `www.${hostname}`;
}

function extractLinks(html: string, base: URL, rootHost: string) {
  const internal = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    const parsed = absolute(match[1], base);
    if (!parsed || !/^https?:$/.test(parsed.protocol) || !sameSite(parsed.hostname, rootHost)) continue;
    parsed.hash = "";
    parsed.search = "";
    if (/\.(?:jpg|jpeg|png|gif|webp|svg|pdf|docx?|xlsx?|zip)$/i.test(parsed.pathname)) continue;
    internal.add(parsed.toString());
    if (internal.size >= 50) break;
  }
  return [...internal];
}

function extractAssets(html: string, base: URL) {
  const assets = new Set<string>();
  for (const match of html.matchAll(/(?:src|srcset|data-src)=["']([^"']+)["']/gi)) {
    const first = match[1].split(",")[0]?.trim().split(/\s+/)[0] || "";
    const parsed = absolute(first, base);
    if (parsed && /^https?:$/.test(parsed.protocol)) assets.add(parsed.toString());
    if (assets.size >= 80) break;
  }
  return [...assets];
}

function extractDownloads(html: string, base: URL) {
  const files = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const parsed = absolute(match[1], base);
    if (parsed && /\.(?:pdf|docx?|xlsx?|csv|zip)$/i.test(parsed.pathname)) files.add(parsed.toString());
  }
  return [...files].slice(0, 30);
}

function extractSocialLinks(html: string, base: URL) {
  const links = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const parsed = absolute(match[1], base);
    if (parsed && /(instagram\.com|facebook\.com|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|linkedin\.com)/i.test(parsed.hostname)) links.add(parsed.toString());
  }
  return [...links].slice(0, 20);
}

function extractSchemaTypes(html: string) {
  const types = new Set<string>();
  for (const match of html.matchAll(/["']@type["']\s*:\s*["']([^"']+)["']/gi)) types.add(cleanText(match[1]));
  return [...types].filter(Boolean).slice(0, 30);
}

function extractHeadings(html: string) {
  const headings: string[] = [];
  for (const match of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const value = cleanText(match[1]);
    if (value && !headings.includes(value)) headings.push(value);
    if (headings.length >= 20) break;
  }
  return headings;
}

function redirectTarget(pathname: string) {
  const value = pathname.toLowerCase();
  if (value === "/" || !value) return "/";
  if (/(menu|food|drink)/.test(value)) return "/menu/";
  if (/(reserv|book|table)/.test(value)) return "/reservations/";
  if (/(event|experience|party|private)/.test(value)) return "/events/";
  if (/(gallery|photo|media)/.test(value)) return "/gallery/";
  if (/(contact|location|visit|hours|directions)/.test(value)) return "/visit/";
  return "/";
}

async function fetchHtml(url: URL, rootHost: string) {
  await assertPublicWebsiteUrl(url.toString());
  const response = await fetch(url, { redirect: "manual", headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(9000) });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) return null;
    const redirected = await assertPublicWebsiteUrl(new URL(location, url).toString());
    if (!sameSite(redirected.hostname, rootHost)) return null;
    const redirectedResponse = await fetch(redirected, { redirect: "manual", headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(9000) });
    if (!redirectedResponse.ok || !(redirectedResponse.headers.get("content-type") || "").includes("text/html")) return null;
    return { url: redirected, html: (await redirectedResponse.text()).slice(0, MAX_PAGE_BYTES) };
  }
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return null;
  return { url, html: (await response.text()).slice(0, MAX_PAGE_BYTES) };
}

export async function crawlWebsiteForMigration(start: URL): Promise<WebsiteMigrationManifest> {
  const rootHost = start.hostname;
  const queue = [start.toString()];
  const seen = new Set<string>();
  const pages: CrawledWebsitePage[] = [];
  let homepageHtml = "";
  let totalBytes = 0;

  while (queue.length && pages.length < MAX_PAGES && totalBytes < MAX_TOTAL_BYTES) {
    const next = queue.shift();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    const fetched = await fetchHtml(new URL(next), rootHost).catch(() => null);
    if (!fetched) continue;
    totalBytes += fetched.html.length;
    if (!homepageHtml) homepageHtml = fetched.html;
    const base = fetched.url;
    const page: CrawledWebsitePage = {
      url: base.toString(),
      path: base.pathname || "/",
      title: matchOne(fetched.html, /<title[^>]*>([\s\S]*?)<\/title>/i),
      description: matchOne(fetched.html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) || matchOne(fetched.html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i),
      canonical: fetched.html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || null,
      headings: extractHeadings(fetched.html),
      assets: extractAssets(fetched.html, base),
      forms: [...fetched.html.matchAll(/<form\b/gi)].length,
      downloads: extractDownloads(fetched.html, base),
      social_links: extractSocialLinks(fetched.html, base),
      schema_types: extractSchemaTypes(fetched.html),
    };
    pages.push(page);
    for (const link of extractLinks(fetched.html, base, rootHost)) if (!seen.has(link) && queue.length < 40) queue.push(link);
  }

  const assets = new Set(pages.flatMap((page) => page.assets));
  const downloads = [...new Set(pages.flatMap((page) => page.downloads))];
  const socialLinks = [...new Set(pages.flatMap((page) => page.social_links))];
  const schemaTypes = [...new Set(pages.flatMap((page) => page.schema_types))];
  const redirectMap = pages.map((page) => ({ from: page.path || "/", to: redirectTarget(page.path || "/") })).filter((item, index, all) => all.findIndex((candidate) => candidate.from === item.from) === index);

  return {
    source_url: start.toString(),
    crawled_pages: pages,
    page_count: pages.length,
    asset_count: assets.size,
    form_count: pages.reduce((sum, page) => sum + page.forms, 0),
    downloads,
    social_links: socialLinks,
    schema_types: schemaTypes,
    redirect_map: redirectMap,
    homepage_html: homepageHtml,
  };
}
