import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";
import { crawlWebsiteForMigration, assertPublicWebsiteUrl } from "@/lib/websites/import-crawler";
import { buildMigrationContentInventory } from "@/lib/websites/import-content-inventory";
import { buildMigrationExceptions } from "@/lib/websites/migration-exceptions";
import { detectWebsiteImportAdapter, extractImportSignals } from "@/lib/websites/import-provider-adapters";

export const runtime = "nodejs";

type MigrationMode = "preserve_exact" | "modernize" | "redesign";

function textMatch(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1]?.replace(/\s+/g, " ").trim() || null;
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
    const contentInventory = buildMigrationContentInventory(manifest, adapter.id);
    const title = textMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = textMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) || textMatch(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
    const themeColor = textMatch(html, /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
    const reservationUrl = manifest.reservation_links[0] || null;
    const detectedReservationProvider = reservationProvider(reservationUrl);
    const exceptions = buildMigrationExceptions(manifest, contentInventory, detectedReservationProvider);
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
      review_status: "pending",
      reviewed_at: null,
      reviewed_by: null,
      discovered_pages: manifest.crawled_pages.map((page) => page.url),
      discovered_assets: [...new Set(manifest.crawled_pages.flatMap((page) => page.assets))],
      reservation_url: reservationUrl,
      reservation_provider: detectedReservationProvider,
      content_inventory: contentInventory,
      exceptions,
      blocking_exception_count: exceptions.filter((item) => item.severity === "blocking").length,
      warning_exception_count: exceptions.filter((item) => item.severity === "warning").length,
      migration_manifest: {
        page_count: manifest.page_count,
        asset_count: manifest.asset_count,
        form_count: manifest.form_count,
        pages: manifest.crawled_pages.map(({ url, path, title: pageTitle, description: pageDescription, canonical, headings, forms, downloads, social_links, schema_types, reservation_links }) => ({
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
          reservation_links,
        })),
        downloads: manifest.downloads,
        social_links: manifest.social_links,
        schema_types: manifest.schema_types,
        reservation_links: manifest.reservation_links,
        redirect_map: manifest.redirect_map,
      },
    };
    const customContent = { ...(website.custom_content || {}), website_import: importAnalysis };
    const { data: updated, error: updateError } = await supabaseAdmin.from("business_websites").update({ theme, custom_content: customContent, site_title: website.site_title || title, updated_at: importedAt }).eq("id", website.id).select("*").single();
    if (updateError) throw updateError;

    if (reservationUrl) {
      await supabaseAdmin.from("locations").update({ reservation_link: reservationUrl, reservation_provider: detectedReservationProvider, reservation_source: "external", allow_external_reservations: true, updated_at: importedAt }).eq("id", locationId);
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
