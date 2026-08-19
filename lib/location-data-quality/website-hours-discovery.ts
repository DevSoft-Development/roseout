import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const DAY_MAP: Record<string, string> = {
  monday: "monday", tuesday: "tuesday", wednesday: "wednesday", thursday: "thursday",
  friday: "friday", saturday: "saturday", sunday: "sunday",
};
const PATHS = ["/", "/hours", "/contact", "/about", "/visit"] as const;
const FETCH_TIMEOUT_MS = 7000;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeWebsite(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  try { return new URL(raw); } catch {
    try { return new URL(`https://${raw}`); } catch { return null; }
  }
}

function normalizeDay(value: unknown) {
  const raw = text(value).toLowerCase().split("/").pop() || "";
  return DAY_MAP[raw] || null;
}

function collectSpecs(node: unknown, output: Record<string, string[]>) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectSpecs(item, output);
    return;
  }
  const value = node as Record<string, unknown>;
  const specs = value.openingHoursSpecification;
  if (Array.isArray(specs)) {
    for (const specValue of specs) {
      if (!specValue || typeof specValue !== "object") continue;
      const spec = specValue as Record<string, unknown>;
      const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek];
      const opens = text(spec.opens);
      const closes = text(spec.closes);
      if (!opens || !closes) continue;
      for (const dayValue of days) {
        const day = normalizeDay(dayValue);
        if (!day) continue;
        output[day] = [...(output[day] || []), `${opens} - ${closes}`];
      }
    }
  }
  for (const child of Object.values(value)) collectSpecs(child, output);
}

export function extractStructuredWebsiteHours(html: string) {
  const hours: Record<string, string[]> = {};
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectSpecs(JSON.parse(match[1]), hours); } catch { /* ignore malformed JSON-LD */ }
  }
  return Object.keys(hours).length ? hours : null;
}

async function fetchHtml(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "TheOutHavenBot/1.0 (+https://theouthaven.com)", Accept: "text/html" },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function processWebsiteHoursDiscovery(limit = 5) {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("locations")
    .select("id,website,google_website_uri,hours_backfill_status,hours_last_backfilled_at")
    .is("operating_hours", null)
    .in("hours_backfill_status", ["google_no_hours", "website_blocked", "website_failed"])
    .or(`hours_last_backfilled_at.is.null,hours_last_backfilled_at.lt.${cutoff}`)
    .order("hours_last_backfilled_at", { ascending: true, nullsFirst: true })
    .limit(Math.max(1, Math.min(limit, 10)));
  if (error) throw new Error(`Hours discovery lookup failed: ${error.message}`);

  const summary = { checked: 0, found: 0, notFound: 0, blocked: 0, failed: 0 };
  for (const row of rows || []) {
    const website = normalizeWebsite(row.website || row.google_website_uri);
    const checkedAt = new Date().toISOString();
    if (!website) {
      await supabaseAdmin.from("locations").update({
        hours_backfill_status: "website_no_hours",
        hours_source: "owner_needed_no_website",
        hours_confidence: "unknown",
        hours_last_backfilled_at: checkedAt,
        hours_backfill_error: "No website available for hours discovery",
      }).eq("id", row.id);
      summary.notFound += 1;
      summary.checked += 1;
      continue;
    }

    let successfulPages = 0;
    let blockedPages = 0;
    let failedPages = 0;
    let foundHours: Record<string, string[]> | null = null;
    let lastError = "";

    for (const path of PATHS) {
      try {
        const response = await fetchHtml(new URL(path, website.origin));
        if (response.status === 403 || response.status === 429) { blockedPages += 1; continue; }
        if (response.status >= 500) { failedPages += 1; continue; }
        if (!response.ok) continue;
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) continue;
        successfulPages += 1;
        foundHours = extractStructuredWebsiteHours(await response.text());
        if (foundHours) break;
      } catch (crawlError) {
        failedPages += 1;
        lastError = crawlError instanceof Error ? crawlError.message : "Website hours discovery failed";
      }
    }

    if (foundHours) {
      const { error: updateError } = await supabaseAdmin.from("locations").update({
        operating_hours: foundHours,
        hours_raw: foundHours,
        hours_backfill_status: "success",
        hours_source: "website_jsonld",
        hours_confidence: "verified",
        hours_last_backfilled_at: checkedAt,
        hours_backfill_error: null,
      }).eq("id", row.id);
      if (updateError) throw new Error(`Hours discovery update failed: ${updateError.message}`);
      summary.found += 1;
    } else if (successfulPages > 0) {
      await supabaseAdmin.from("locations").update({
        hours_backfill_status: "website_no_hours",
        hours_source: "website_crawl_no_hours",
        hours_confidence: "unknown",
        hours_last_backfilled_at: checkedAt,
        hours_backfill_error: `Checked ${successfulPages} website page(s); no structured hours found`,
      }).eq("id", row.id);
      summary.notFound += 1;
    } else if (blockedPages > 0) {
      await supabaseAdmin.from("locations").update({
        hours_backfill_status: "website_blocked",
        hours_last_backfilled_at: checkedAt,
        hours_backfill_error: "Website blocked hours discovery",
      }).eq("id", row.id);
      summary.blocked += 1;
    } else {
      await supabaseAdmin.from("locations").update({
        hours_backfill_status: "website_failed",
        hours_last_backfilled_at: checkedAt,
        hours_backfill_error: lastError || `Website hours discovery failed across ${failedPages} request(s)`,
      }).eq("id", row.id);
      summary.failed += 1;
    }
    summary.checked += 1;
  }
  return summary;
}
