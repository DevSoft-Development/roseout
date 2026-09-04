import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set([
  "theouthaven.com",
  "www.theouthaven.com",
  "outhvn.com",
  "www.outhvn.com",
]);

function resolveTarget(raw: string | null) {
  const value = (raw || "/").trim();
  const target = value.startsWith("http://") || value.startsWith("https://")
    ? new URL(value)
    : new URL(value.startsWith("/") ? value : `/${value}`, "https://theouthaven.com");

  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
    throw new Error("Only public TheOutHaven HTTPS URLs can be inspected.");
  }
  target.hash = "";
  return target;
}

function firstMatch(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match?.[1]?.replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim() || null;
}

function getMeta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return firstMatch(html, new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"))
    || firstMatch(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["'][^>]*>`, "i"));
}

function canonicalFrom(html: string) {
  return firstMatch(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)
    || firstMatch(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i);
}

async function sitemapContains(url: URL) {
  try {
    const sitemap = await fetch("https://theouthaven.com/sitemap.xml", {
      cache: "no-store",
      headers: { "user-agent": "TheOutHaven-SEO-Operations/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!sitemap.ok) return false;
    const xml = await sitemap.text();
    const variants = new Set([
      url.toString().replace(/\/$/, ""),
      url.toString(),
      url.toString().replace("https://www.theouthaven.com", "https://theouthaven.com").replace(/\/$/, ""),
    ]);
    return Array.from(variants).some((candidate) => xml.includes(`<loc>${candidate}</loc>`) || xml.includes(`<loc>${candidate}/</loc>`));
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.seoTools);
  if (auth.error) return auth.error;

  try {
    const target = resolveTarget(new URL(request.url).searchParams.get("url"));
    const response = await fetch(target, {
      redirect: "follow",
      cache: "no-store",
      headers: { "user-agent": "TheOutHaven-SEO-Operations/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    const contentType = response.headers.get("content-type") || "";
    const html = contentType.includes("text/html") ? await response.text() : "";
    const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = getMeta(html, "description");
    const robots = getMeta(html, "robots");
    const canonical = canonicalFrom(html);
    const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
    const noindex = /\bnoindex\b/i.test(robots || "") || /\bnoindex\b/i.test(response.headers.get("x-robots-tag") || "");
    const inSitemap = await sitemapContains(new URL(response.url || target.toString()));

    const issues: string[] = [];
    if (!response.ok) issues.push(`HTTP status is ${response.status}; public indexable pages should normally return 200.`);
    if (!title) issues.push("Missing page title.");
    if (!description) issues.push("Missing meta description.");
    if (!canonical) issues.push("Missing canonical URL.");
    if (noindex) issues.push("Page is marked noindex.");
    if (!hasJsonLd) issues.push("No JSON-LD structured data detected.");
    if (!inSitemap) issues.push("URL was not found in the primary sitemap.");

    return NextResponse.json({
      url: response.url || target.toString(),
      status: response.status,
      ok: response.ok,
      indexable: response.ok && !noindex,
      title,
      description,
      canonical,
      robots,
      hasJsonLd,
      inSitemap,
      issues,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not inspect URL." },
      { status: 400 },
    );
  }
}
