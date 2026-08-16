import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const GOOGLE_FIELDS = [
  "id",
  "websiteUri",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "currentOpeningHours",
  "regularOpeningHours",
  "utcOffsetMinutes",
  "businessStatus",
].join(",");

const PROVIDERS = [
  ["resy.com", "Resy"], ["opentable.com", "OpenTable"], ["exploretock.com", "Tock"],
  ["sevenrooms.com", "SevenRooms"], ["book.squareup.com", "Square"], ["toasttab.com", "Toast"],
  ["eventbrite.com", "Eventbrite"], ["mindbodyonline.com", "Mindbody"], ["fareharbor.com", "FareHarbor"],
  ["peek.com", "Peek"], ["calendly.com", "Calendly"], ["tablecheck.com", "TableCheck"],
  ["tablescheck.com", "TableCheck"], ["eatapp.co", "Eat App"], ["simpleerb.com", "SimpleERB"],
] as const;
const DISCOVERY_PATHS = ["/", "/reservations", "/reserve", "/book"];
const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 8;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function blank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") { const v = value.trim(); return !v || v === "null" || v === "{}" || v === "[]"; }
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}
function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 1000);
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return String(value.message || value.details || value.hint || JSON.stringify(value)).slice(0, 1000);
  }
  return String(error).slice(0, 1000);
}
function managed(row: Record<string, unknown>) {
  const source = String(row.profile_managed_by || "").toLowerCase();
  return row.profile_manual_lock === true || source === "owner" || source === "admin";
}
function normalizeGoogleHours(value: any) {
  if (!value || typeof value !== "object") return null;
  const descriptions = Array.isArray(value.weekdayDescriptions) ? value.weekdayDescriptions : Array.isArray(value.weekday_descriptions) ? value.weekday_descriptions : [];
  if (!descriptions.length) return null;
  const output: Record<string, string[]> = {};
  for (const raw of descriptions) {
    const text = String(raw || "").replace(/[\u00a0\u202f]/g, " ").replace(/\s*[–—-]\s*/g, " - ").replace(/\s+/g, " ").trim();
    const match = text.match(/^([^:]+):\s*(.+)$/); if (!match) continue;
    output[match[1].trim().toLowerCase()] = [match[2].trim()];
  }
  return Object.keys(output).length ? output : null;
}
function normalizeUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try { return new URL(value.trim()).toString(); } catch { try { return new URL(`https://${value.trim()}`).toString(); } catch { return null; } }
}
function reservationMatch(candidate: string) {
  try {
    const url = new URL(candidate); const host = url.hostname.toLowerCase().replace(/^www\./, ""); const path = url.pathname.toLowerCase();
    if (host === "yelp.com" || host.endsWith(".yelp.com")) { if (!path.includes("/reservations")) return null; return { url: url.toString(), provider: "Yelp Reservations" }; }
    for (const [providerHost, provider] of PROVIDERS) {
      if (host === providerHost || host.endsWith(`.${providerHost}`)) { url.protocol = "https:"; url.hash = ""; return { url: url.toString(), provider }; }
    }
  } catch { return null; }
  return null;
}
function extractLinks(html: string, base: URL) {
  const results: string[] = []; const decoded = html.replace(/\\u0026/g, "&").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  for (const match of decoded.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) { try { results.push(new URL(match[1], base).toString()); } catch { /* ignore */ } }
  for (const match of decoded.matchAll(/(?:https?:\/\/|www\.)[^\s"'<>\\)\]]+/gi)) { const normalized = normalizeUrl(match[0]); if (normalized) results.push(normalized); }
  return results;
}
async function discoverReservation(website: string) {
  const normalized = normalizeUrl(website); if (!normalized) return { status: "failed", match: null, note: "Invalid website URL" };
  const home = new URL(normalized); const direct = reservationMatch(home.toString());
  if (direct) return { status: "found", match: direct, note: "Website is a reservation provider URL" };
  let checked = 0;
  for (const path of DISCOVERY_PATHS) {
    if (checked >= 3) break; checked += 1; const url = new URL(path, home.origin); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "User-Agent": "TheOutHavenBot/1.0 (+https://theouthaven.com)", "Accept": "text/html" } });
      if (response.status === 403 || response.status === 429) return { status: "blocked", match: null, note: `Website returned ${response.status}` };
      if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) continue;
      const matches = extractLinks(await response.text(), url).map(reservationMatch).filter(Boolean) as Array<{ url: string; provider: string }>;
      if (matches.length) return { status: "found", match: matches[0], note: `Found on ${url.pathname}` };
    } catch (error) { return { status: "failed", match: null, note: error instanceof Error ? error.message : "Website discovery failed" }; }
    finally { clearTimeout(timeout); }
  }
  return { status: "not_found", match: null, note: `Checked ${checked} page(s)` };
}
async function googleDetails(placeId: string, key: string) {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": GOOGLE_FIELDS } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(String(body?.error?.message || `Google Place Details failed: ${response.status}`)); (error as any).status = response.status; throw error; }
  return body;
}

serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET") || Deno.env.get("UNIFIED_LOCATION_GAP_REPAIR_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return json({ error: "Unauthorized" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const googleKey = Deno.env.get("GOOGLE_PLACES_API_KEY") || Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!supabaseUrl || !serviceKey || !googleKey) return json({ error: "Missing required environment" }, 500);

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(50, Math.max(1, Number(body.limit || 20)));
  const concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, Number(body.concurrency || DEFAULT_CONCURRENCY)));
  const supabase = createClient(supabaseUrl, serviceKey); const now = new Date();
  const dueFilter = "gap_repair_next_attempt_at.is.null,gap_repair_next_attempt_at.lte." + now.toISOString() + ",and(reservation_discovery_status.eq.no_website,website.not.is.null)";
  const { data: rows, error } = await supabase.from("locations")
    .select("id,name,google_place_id,operating_hours,google_regular_opening_hours,google_current_opening_hours,website,phone,external_reservation_url,reservation_url,reservation_link,booking_url,reservation_discovery_status,reservation_discovery_checked_at,profile_managed_by,profile_manual_lock,gap_repair_status,gap_repair_last_checked_at,gap_repair_next_attempt_at,gap_repair_google_calls,deleted_at,is_demo")
    .is("deleted_at", null)
    .or(dueFilter)
    .order("gap_repair_last_checked_at", { ascending: true, nullsFirst: true }).limit(limit * 8);
  if (error) return json({ error: error.message }, 500);

  const candidates = (rows || []).filter((row: any) => {
    if (row.is_demo === true) return false;
    const coreGap = blank(row.operating_hours) || blank(row.website) || blank(row.phone);
    const reservationStatus = String(row.reservation_discovery_status || "");
    const retryNoWebsite = reservationStatus === "no_website" && !blank(row.website);
    const reservationGap = blank(row.external_reservation_url) && blank(row.reservation_url) && blank(row.reservation_link) && blank(row.booking_url)
      && (!row.reservation_discovery_checked_at || ["failed", "blocked"].includes(reservationStatus) || retryNoWebsite);
    return coreGap || reservationGap;
  }).slice(0, limit);

  const counters = { selected: candidates.length, concurrency, googleCalls: 0, cachedHoursFilled: 0, hoursFilled: 0, websitesFilled: 0, phonesFilled: 0, reservationFound: 0, reservationNotFound: 0, reservationBlocked: 0, reservationFailed: 0, managedCoreSkipped: 0, failed: 0 };

  const processRow = async (row: any) => {
    const update: Record<string, unknown> = { gap_repair_last_checked_at: new Date().toISOString(), gap_repair_status: "checked", gap_repair_error: null };
    let retryHours = 24 * 30;
    try {
      const isManaged = managed(row);
      if (blank(row.operating_hours) && !isManaged) {
        const cachedGoogleHours = normalizeGoogleHours(row.google_regular_opening_hours || row.google_current_opening_hours);
        if (cachedGoogleHours) {
          update.operating_hours = cachedGoogleHours;
          update.hours_source = "google_cached_unified_repair";
          update.hours_confidence = "verified";
          update.hours_backfill_status = "success";
          update.hours_last_backfilled_at = new Date().toISOString();
          counters.cachedHoursFilled += 1;
          counters.hoursFilled += 1;
        }
      }

      const needsCore = (blank(row.operating_hours) && blank(update.operating_hours)) || blank(row.website) || blank(row.phone);
      if (needsCore && row.google_place_id && !isManaged) {
        const place = await googleDetails(row.google_place_id, googleKey); counters.googleCalls += 1; update.gap_repair_google_calls = Number(row.gap_repair_google_calls || 0) + 1;
        const normalizedHours = normalizeGoogleHours(place.regularOpeningHours || place.regular_opening_hours);
        if (blank(row.operating_hours) && blank(update.operating_hours) && normalizedHours) {
          update.operating_hours = normalizedHours; update.google_regular_opening_hours = place.regularOpeningHours || place.regular_opening_hours || null;
          update.google_current_opening_hours = place.currentOpeningHours || place.current_opening_hours || null; update.hours_source = "google_places_details_unified_repair";
          update.hours_confidence = "verified"; update.hours_backfill_status = "success"; update.hours_last_backfilled_at = new Date().toISOString(); counters.hoursFilled += 1;
        }
        if (blank(row.website) && place.websiteUri) { update.website = place.websiteUri; counters.websitesFilled += 1; }
        const phone = place.nationalPhoneNumber || place.internationalPhoneNumber; if (blank(row.phone) && phone) { update.phone = phone; counters.phonesFilled += 1; }
      } else if (needsCore && isManaged) counters.managedCoreSkipped += 1;

      const website = String(update.website || row.website || "").trim();
      const alreadyHasReservation = !blank(row.external_reservation_url) || !blank(row.reservation_url) || !blank(row.reservation_link) || !blank(row.booking_url);
      const reservationStatus = String(row.reservation_discovery_status || "");
      const needsReservationDiscovery = !alreadyHasReservation && (!row.reservation_discovery_checked_at || ["failed", "blocked"].includes(reservationStatus) || (reservationStatus === "no_website" && Boolean(website)));
      if (needsReservationDiscovery) {
        if (!website) {
          update.reservation_discovery_status = "no_website"; update.reservation_discovery_source = "unified_gap_repair"; update.reservation_discovery_notes = "No website available for free discovery"; update.reservation_discovery_checked_at = new Date().toISOString();
        } else {
          const discovery = await discoverReservation(website); update.reservation_discovery_status = discovery.status; update.reservation_discovery_source = "website_crawl";
          update.reservation_discovery_notes = discovery.note; update.reservation_discovery_checked_at = new Date().toISOString(); update.reservation_last_checked_at = new Date().toISOString();
          if (discovery.match) {
            const match = discovery.match; update.external_reservation_url = match.url; update.reservation_url = match.url; update.reservation_link = match.url;
            update.reservation_provider_url = match.url; update.reservation_external_url = match.url; update.reservation_platform_url = match.url;
            update.reservation_provider = match.provider; update.reservation_provider_name = match.provider; update.reservation_platform = match.provider;
            update.reservation_provider_status = "discovered"; update.reservation_source = "external"; update.reservation_source_url = website; counters.reservationFound += 1;
          } else if (discovery.status === "not_found") counters.reservationNotFound += 1;
          else if (discovery.status === "blocked") { counters.reservationBlocked += 1; retryHours = 24 * 7; }
          else { counters.reservationFailed += 1; retryHours = 24; }
        }
      }
      update.gap_repair_next_attempt_at = new Date(Date.now() + retryHours * 60 * 60 * 1000).toISOString();
      const { error: updateError } = await supabase.from("locations").update(update).eq("id", row.id); if (updateError) throw updateError;
    } catch (error) {
      counters.failed += 1; const status = Number((error as any)?.status || 0); const retry = status === 429 ? 6 : status >= 500 ? 12 : 24;
      await supabase.from("locations").update({ gap_repair_status: "failed", gap_repair_error: errorMessage(error), gap_repair_last_checked_at: new Date().toISOString(), gap_repair_next_attempt_at: new Date(Date.now() + retry * 60 * 60 * 1000).toISOString() }).eq("id", row.id);
    }
  };

  for (let index = 0; index < candidates.length; index += concurrency) {
    const wave = candidates.slice(index, index + concurrency);
    await Promise.all(wave.map(processRow));
  }

  return json({ success: true, ...counters });
});
