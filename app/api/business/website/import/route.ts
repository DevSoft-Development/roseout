import { lookup } from "node:dns/promises";
import net from "node:net";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";
import { detectWebsiteImportAdapter, extractImportSignals } from "@/lib/websites/import-provider-adapters";

export const runtime = "nodejs";

type MigrationMode = "preserve_exact" | "modernize" | "redesign";

function isPrivateIp(ip: string) {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const value = ip.toLowerCase();
  return value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd");
}

async function assertPublicUrl(raw: string) {
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error("unsupported_website_protocol");
  if (!url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("private_website_host");
  if (net.isIP(url.hostname) && isPrivateIp(url.hostname)) throw new Error("private_website_host");
  const answers = await lookup(url.hostname, { all: true });
  if (!answers.length || answers.some((answer) => isPrivateIp(answer.address))) throw new Error("private_website_host");
  return url;
}

function textMatch(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function absoluteUrl(value: string | null, base: URL) {
  if (!value) return null;
  try { return new URL(value, base).toString(); } catch { return null; }
}

function extractLinks(html: string, base: URL) {
  const links = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    const resolved = absoluteUrl(match[1], base);
    if (!resolved) continue;
    const parsed = new URL(resolved);
    if (parsed.hostname === base.hostname && /^https?:$/.test(parsed.protocol)) links.add(`${parsed.origin}${parsed.pathname}`);
    if (links.size >= 40) break;
  }
  return [...links];
}

function extractAssets(html: string, base: URL) {
  const assets = new Set<string>();
  for (const match of html.matchAll(/(?:src|srcset|data-src)=["']([^"']+)["']/gi)) {
    const first = match[1].split(",")[0]?.trim().split(/\s+/)[0] || "";
    const resolved = absoluteUrl(first, base);
    if (resolved && /^https?:/i.test(resolved)) assets.add(resolved);
    if (assets.size >= 80) break;
  }
  return [...assets];
}

function detectReservationLink(html: string, base: URL) {
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = absoluteUrl(match[1], base);
    if (!href) continue;
    if (/(resy|opentable|sevenrooms|exploretock|toasttab|yelp\.com\/reservations|reserve|reservation|book)/i.test(href)) return href;
  }
  return null;
}

function reservationProvider(url: string | null) {
  if (!url) return null;
  if (/resy/i.test(url)) return "Resy";
  if (/opentable/i.test(url)) return "OpenTable";
  if (/sevenrooms/i.test(url)) return "SevenRooms";
  if (/exploretock|tock/i.test(url)) return "Tock";
  if (/toasttab/i.test(url)) return "Toast Tables";
  if (/yelp/i.test(url)) return "Yelp Reservations";
  if (/quandoo/i.test(url)) return "Quandoo";
  return "External";
}

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const locationId = String(body.location_id || "").trim();
  const mode = String(body.mode || "modernize") as MigrationMode;
  if (!locationId || !["preserve_exact", "modernize", "redesign"].includes(mode)) return NextResponse.json({ error: "Invalid website import request." }, { status: 400 });

  try {
    const sourceUrl = await assertPublicUrl(String(body.url || "").trim());
    const location = await getAuthorizedWebsiteLocation(user, locationId, "id");
    if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

    const response = await fetch(sourceUrl, { redirect: "manual", headers: { "user-agent": "TheOutHaven Website Migration/1.1" }, signal: AbortSignal.timeout(12000) });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next) throw new Error("website_redirect_missing");
      const redirected = await assertPublicUrl(new URL(next, sourceUrl).toString());
      if (redirected.hostname !== sourceUrl.hostname && !redirected.hostname.endsWith(`.${sourceUrl.hostname}`)) throw new Error("website_redirect_changed_host");
      return NextResponse.json({ error: "Website redirects must be imported from their final URL.", final_url: redirected.toString() }, { status: 409 });
    }
    if (!response.ok) throw new Error(`website_fetch_${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) throw new Error("website_not_html");
    const html = (await response.text()).slice(0, 2_000_000);
    const adapter = detectWebsiteImportAdapter(html, sourceUrl.hostname);
    const adapterSignals = extractImportSignals(html, adapter);
    const title = textMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = textMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) || textMatch(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
    const themeColor = textMatch(html, /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
    const reservationUrl = detectReservationLink(html, sourceUrl);
    const pages = extractLinks(html, sourceUrl);
    const assets = extractAssets(html, sourceUrl);
    const importedAt = new Date().toISOString();

    const { data: website, error: readError } = await supabaseAdmin.from("business_websites").select("id,theme,custom_content,site_title").eq("location_id", locationId).maybeSingle();
    if (readError) throw readError;
    if (!website) return NextResponse.json({ error: "Create the website draft before importing." }, { status: 409 });
    const theme = { ...(website.theme || {}), migration_mode: mode, design_lock: mode === "preserve_exact", imported_theme_color: themeColor, imported_provider: adapter.label, import_adapter_id: adapter.id };
    const importAnalysis = { source_url: sourceUrl.toString(), provider: adapter.label, adapter_id: adapter.id, mode, imported_at: importedAt, title, description, discovered_pages: pages, discovered_assets: assets, reservation_url: reservationUrl, reservation_provider: reservationProvider(reservationUrl), ...adapterSignals };
    const customContent = { ...(website.custom_content || {}), website_import: importAnalysis };
    const { data: updated, error: updateError } = await supabaseAdmin.from("business_websites").update({ theme, custom_content: customContent, site_title: website.site_title || title, updated_at: importedAt }).eq("id", website.id).select("*").single();
    if (updateError) throw updateError;

    if (reservationUrl) {
      await supabaseAdmin.from("locations").update({ reservation_link: reservationUrl, reservation_provider: reservationProvider(reservationUrl), reservation_source: "external", allow_external_reservations: true, updated_at: importedAt }).eq("id", locationId);
    }

    return NextResponse.json({ ok: true, website: updated, analysis: { ...importAnalysis, page_count: pages.length, asset_count: assets.length, theme_color: themeColor } });
  } catch (error) {
    console.error("Website import failed", { locationId, error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: "We could not analyze that website. Check the URL and try again." }, { status: 400 });
  }
}
