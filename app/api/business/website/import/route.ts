import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";
import { crawlWebsiteForMigration, assertPublicWebsiteUrl } from "@/lib/websites/import-crawler";
import { detectWebsiteImportAdapter, extractImportSignals } from "@/lib/websites/import-provider-adapters";

export const runtime = "nodejs";

type MigrationMode = "preserve_exact" | "modernize" | "redesign";

function textMatch(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function absoluteUrl(value: string | null, base: URL) {
  if (!value) return null;
  try { return new URL(value, base).toString(); } catch { return null; }
}

function detectReservationLink(html: string, base: URL) {
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = absoluteUrl(match[1], base);
    if (!href) continue;
    if (/(resy|opentable|sevenrooms|exploretock|toasttab|yelp\.com\/reservations|quandoo|reserve|reservation|book)/i.test(href)) return href;
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
    const rawUrl = String(body.url || "").trim();
    const sourceUrl = await assertPublicWebsiteUrl(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    const location = await getAuthorizedWebsiteLocation(user, locationId, "id");
    if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

    const manifest = await crawlWebsiteForMigration(sourceUrl);
    if (!manifest.homepage_html) throw new Error("website_not_html");

    const html = manifest.homepage_html;
    const adapter = detectWebsiteImportAdapter(html, sourceUrl.hostname);
    const adapterSignals = extractImportSignals(html, adapter);
    const title = textMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = textMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) || textMatch(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
    const themeColor = textMatch(html, /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
    const reservationUrl = manifest.crawled_pages.map((page) => detectReservationLink(htmlForPage(page.url, manifest), new URL(page.url))).find(Boolean) || detectReservationLink(html, sourceUrl);
    const importedAt = new Date().toISOString();

    const { data: website, error: readError } = await supabaseAdmin.from("business_websites").select("id,theme,custom_content,site_title").eq("location_id", locationId).maybeSingle();
    if (readError) throw readError;
    if (!website) return NextResponse.json({ error: "Create the website draft before importing." }, { status: 409 });

    const theme = {
      ...(website.theme || {}),
      migration_mode: mode,
      design_lock: mode === "preserve_exact",
      imported_theme_color: themeColor,
      imported_provider: adapter.label,
      import_adapter_id: adapter.id,
    };
    const importAnalysis = {
      source_url: sourceUrl.toString(),
      ...adapterSignals,
      mode,
      imported_at: importedAt,
      title,
      description,
      discovered_pages: manifest.crawled_pages.map((page) => page.url),
      discovered_assets: [...new Set(manifest.crawled_pages.flatMap((page) => page.assets))],
      reservation_url: reservationUrl,
      reservation_provider: reservationProvider(reservationUrl),
      migration_manifest: {
        page_count: manifest.page_count,
        asset_count: manifest.asset_count,
        form_count: manifest.form_count,
        pages: manifest.crawled_pages.map(({ url, path, title: pageTitle, description: pageDescription, canonical, headings, forms, downloads, social_links, schema_types }) => ({
          url,
          path,
          title: pageTitle,
          description: pageDescription,
          canonical,
          headings,
          forms,
          downloads,
          social_links,
          schema_types,
        })),
        downloads: manifest.downloads,
        social_links: manifest.social_links,
        schema_types: manifest.schema_types,
        redirect_map: manifest.redirect_map,
      },
    };
    const customContent = { ...(website.custom_content || {}), website_import: importAnalysis };
    const { data: updated, error: updateError } = await supabaseAdmin.from("business_websites").update({ theme, custom_content: customContent, site_title: website.site_title || title, updated_at: importedAt }).eq("id", website.id).select("*").single();
    if (updateError) throw updateError;

    if (reservationUrl) {
      await supabaseAdmin.from("locations").update({ reservation_link: reservationUrl, reservation_provider: reservationProvider(reservationUrl), reservation_source: "external", allow_external_reservations: true, updated_at: importedAt }).eq("id", locationId);
    }

    return NextResponse.json({
      ok: true,
      website: updated,
      analysis: {
        ...importAnalysis,
        page_count: manifest.page_count,
        asset_count: manifest.asset_count,
        form_count: manifest.form_count,
        theme_color: themeColor,
      },
    });
  } catch (error) {
    console.error("Website import failed", { locationId, error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: "We could not analyze that website. Check the URL and try again." }, { status: 400 });
  }
}

function htmlForPage(url: string, manifest: Awaited<ReturnType<typeof crawlWebsiteForMigration>>) {
  if (url === manifest.source_url || manifest.crawled_pages[0]?.url === url) return manifest.homepage_html;
  return "";
}
