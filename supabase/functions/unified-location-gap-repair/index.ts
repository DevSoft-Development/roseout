import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { createOpenTableDirectoryAdapter, discoverReservation, reservationRecoveryPriority } from "./reservation-discovery.ts";
import { discoverMenu, MENU_INTELLIGENCE_VERSION } from "./menu-discovery.ts";

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
const GOOGLE_TEXT_SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
].join(",");

const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 8;
const DEFAULT_TEXT_SEARCH_LIMIT = 3;
const MAX_TEXT_SEARCH_LIMIT = 5;
const DEFAULT_MENU_DISCOVERY_LIMIT = 5;
const MAX_MENU_DISCOVERY_LIMIT = 10;
const DEFAULT_MENU_CONTENT_LIMIT = 3;
const MAX_MENU_CONTENT_LIMIT = 5;
const MENU_REFRESH_DAYS = 30;
const GOOGLE_NO_DATA_COOLDOWN_HOURS = 24 * 90;
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
function normalizeText(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function tokenOverlap(left: unknown, right: unknown) {
  const leftTokens = new Set(normalizeText(left).split(" ").filter((token) => token.length > 1));
  const rightTokens = new Set(normalizeText(right).split(" ").filter((token) => token.length > 1));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  return shared / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
}
function streetNumber(value: unknown) {
  return normalizeText(value).match(/^\d+/)?.[0] || null;
}
function finiteCoordinate(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) > 0.000001 ? number : null;
}
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}
function asArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
}
function uniqueMerge(...values: unknown[]): string[] {
  return [...new Set(values.flatMap(asArray))];
}
function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function menuDue(row: any, now = Date.now()) {
  if (String(row.location_type || "").toLowerCase() !== "restaurant") return false;
  if (managed(row)) return false;
  const website = String(row.website || "").trim();
  if (!website) return false;
  const status = String(row.menu_discovery_status || "").toLowerCase();
  const checkedAt = row.menu_discovery_checked_at ? new Date(row.menu_discovery_checked_at).getTime() : 0;
  const intelligenceMissing = Boolean(row.menu_url) && (!row.menu_intelligence_checked_at || row.menu_intelligence_version !== MENU_INTELLIGENCE_VERSION);
  const stale = checkedAt > 0 && checkedAt <= now - MENU_REFRESH_DAYS * 86400000;
  return blank(row.menu_url) || !checkedAt || intelligenceMissing || stale || ["pending", "failed", "blocked", "stale"].includes(status);
}
function protectedMenuUrl(row: any) {
  const source = String(row.menu_url_source || "").toLowerCase();
  return Boolean(row.menu_url) && ["owner", "admin", "manual", "owner_dashboard", "admin_dashboard"].includes(source);
}
async function googleDetails(placeId: string, key: string) {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": GOOGLE_FIELDS } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(String(body?.error?.message || `Google Place Details failed: ${response.status}`)); (error as any).status = response.status; throw error; }
  return body;
}
async function googleTextSearch(row: any, key: string) {
  const query = [row.name, row.address || row.street_address, row.city, row.state, row.postal_code || row.zip_code].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (!query) return null;
  const latitude = finiteCoordinate(row.latitude);
  const longitude = finiteCoordinate(row.longitude);
  const requestBody: Record<string, unknown> = { textQuery: query, pageSize: 3, languageCode: "en" };
  if (latitude != null && longitude != null) {
    requestBody.locationBias = { circle: { center: { latitude, longitude }, radius: 1000 } };
  }
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": GOOGLE_TEXT_SEARCH_FIELDS },
    body: JSON.stringify(requestBody),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(String(body?.error?.message || `Google Text Search failed: ${response.status}`)); (error as any).status = response.status; throw error; }
  const postalCode = String(row.postal_code || row.zip_code || "").trim();
  const expectedStreetNumber = streetNumber(row.address || row.street_address);
  const scored = (Array.isArray(body?.places) ? body.places : []).map((place: any) => {
    const formattedAddress = String(place?.formattedAddress || "");
    const displayName = String(place?.displayName?.text || "");
    const placeLat = finiteCoordinate(place?.location?.latitude);
    const placeLon = finiteCoordinate(place?.location?.longitude);
    const distance = latitude != null && longitude != null && placeLat != null && placeLon != null ? distanceMeters(latitude, longitude, placeLat, placeLon) : null;
    const postalMatch = Boolean(postalCode && normalizeText(formattedAddress).includes(normalizeText(postalCode)));
    const numberMatch = Boolean(expectedStreetNumber && streetNumber(formattedAddress) === expectedStreetNumber);
    const nameOverlap = tokenOverlap(row.name, displayName);
    let score = 0;
    if (distance != null && distance <= 150) score += 5;
    else if (distance != null && distance <= 300) score += 4;
    else if (distance != null && distance <= 600) score += 2;
    if (postalMatch) score += 3;
    if (numberMatch) score += 2;
    if (nameOverlap >= 0.8) score += 4;
    else if (nameOverlap >= 0.5) score += 2;
    return { place, score, distance, postalMatch, nameOverlap };
  }).sort((a: any, b: any) => b.score - a.score);
  const best = scored[0];
  const runnerUp = scored[1];
  if (!best?.place?.id) return null;
  const strongGeo = (best.distance != null && best.distance <= 300) || best.postalMatch;
  const clearWinner = !runnerUp || best.score >= runnerUp.score + 2;
  if (!strongGeo || !clearWinner || best.score < 7 || best.nameOverlap < 0.5) return null;
  return { id: best.place.id, score: best.score, distance: best.distance };
}

serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET") || Deno.env.get("UNIFIED_LOCATION_GAP_REPAIR_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return json({ error: "Unauthorized" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const googleKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!supabaseUrl || !serviceKey || !googleKey) return json({ error: "Missing required environment" }, 500);

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(50, Math.max(1, Number(body.limit || 20)));
  const concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, Number(body.concurrency || DEFAULT_CONCURRENCY)));
  const textSearchLimit = Math.min(MAX_TEXT_SEARCH_LIMIT, Math.max(0, Number(body.textSearchLimit ?? DEFAULT_TEXT_SEARCH_LIMIT)));
  const menuDiscoveryLimit = Math.min(MAX_MENU_DISCOVERY_LIMIT, Math.max(0, Number(body.menuDiscoveryLimit ?? DEFAULT_MENU_DISCOVERY_LIMIT)));
  const menuContentLimit = Math.min(MAX_MENU_CONTENT_LIMIT, Math.max(0, Number(body.menuContentLimit ?? DEFAULT_MENU_CONTENT_LIMIT)));
  const supabase = createClient(supabaseUrl, serviceKey); const now = new Date();
  const openTableAdapter = createOpenTableDirectoryAdapter(Deno.env);
  const dueFilter = "gap_repair_next_attempt_at.is.null,gap_repair_next_attempt_at.lte." + now.toISOString() + ",and(reservation_discovery_status.eq.no_website,website.not.is.null)";
  const googleDueFilter = "gap_repair_google_next_attempt_at.is.null,gap_repair_google_next_attempt_at.lte." + now.toISOString();
  const selectFields = "id,name,location_type,address,street_address,city,state,postal_code,zip_code,latitude,longitude,google_place_id,operating_hours,google_regular_opening_hours,google_current_opening_hours,website,phone,external_reservation_url,reservation_url,reservation_link,booking_url,reservation_discovery_status,reservation_discovery_checked_at,profile_managed_by,profile_manual_lock,gap_repair_status,gap_repair_last_checked_at,gap_repair_next_attempt_at,gap_repair_google_calls,gap_repair_google_next_attempt_at,menu_url,menu_url_source,menu_discovery_status,menu_discovery_confidence,menu_discovery_checked_at,menu_discovery_error,menu_content_hash,menu_intelligence_checked_at,menu_intelligence_version,signature_items,search_keywords,special_features,semantic_tags,intent_tags,cuisine,cuisine_type,needs_semantic_refresh,profile_field_sources,metadata,deleted_at,is_demo";

  const [
    { data: identityRows, error: identityError },
    { data: cachedRows, error: cachedError },
    { data: backlogRows, error: backlogError },
    { data: menuRows, error: menuError },
  ] = await Promise.all([
    supabase.from("locations")
      .select(selectFields)
      .is("deleted_at", null)
      .is("google_place_id", null)
      .or("operating_hours.is.null,website.is.null,phone.is.null")
      .or(googleDueFilter)
      .order("gap_repair_last_checked_at", { ascending: true, nullsFirst: true })
      .limit(Math.max(textSearchLimit * 2, textSearchLimit)),
    supabase.from("locations")
      .select(selectFields)
      .is("deleted_at", null)
      .is("operating_hours", null)
      .not("google_regular_opening_hours", "is", null)
      .or(dueFilter)
      .order("gap_repair_last_checked_at", { ascending: true, nullsFirst: true })
      .limit(limit),
    supabase.from("locations")
      .select(selectFields)
      .is("deleted_at", null)
      .or(dueFilter)
      .order("gap_repair_last_checked_at", { ascending: true, nullsFirst: true })
      .limit(limit * 8),
    supabase.from("locations")
      .select(selectFields)
      .is("deleted_at", null)
      .eq("location_type", "restaurant")
      .not("website", "is", null)
      .order("menu_discovery_checked_at", { ascending: true, nullsFirst: true })
      .limit(Math.max(menuDiscoveryLimit * 6, menuDiscoveryLimit)),
  ]);
  if (identityError || cachedError || backlogError || menuError) return json({ error: (identityError || cachedError || backlogError || menuError)?.message || "Failed to load repair candidates" }, 500);

  const mergedRows = [...(identityRows || []), ...(cachedRows || []), ...(backlogRows || [])].filter((row: any, index, all) => all.findIndex((candidate: any) => candidate.id === row.id) === index);
  const primaryCandidates = mergedRows.filter((row: any) => {
    if (row.is_demo === true) return false;
    const coreGap = blank(row.operating_hours) || blank(row.website) || blank(row.phone);
    const cachedHoursGap = blank(row.operating_hours) && (!blank(row.google_regular_opening_hours) || !blank(row.google_current_opening_hours));
    const googleDue = !row.gap_repair_google_next_attempt_at || new Date(row.gap_repair_google_next_attempt_at).getTime() <= now.getTime();
    const coreEligible = coreGap && (!row.google_place_id || cachedHoursGap || googleDue);
    const reservationStatus = String(row.reservation_discovery_status || "");
    const retryNoWebsite = reservationStatus === "no_website" && !blank(row.website);
    const unclassifiedWithWebsite = !reservationStatus && !blank(row.website);
    const reservationGap = blank(row.external_reservation_url) && blank(row.reservation_url) && blank(row.reservation_link) && blank(row.booking_url)
      && (!row.reservation_discovery_checked_at || ["failed", "blocked"].includes(reservationStatus) || retryNoWebsite || unclassifiedWithWebsite);
    return coreEligible || reservationGap;
  }).sort((left: any, right: any) => reservationRecoveryPriority(left) - reservationRecoveryPriority(right)).slice(0, limit);

  const selectedIds = new Set(primaryCandidates.map((row: any) => String(row.id)));
  const menuCandidates = (menuRows || [])
    .filter((row: any) => row.is_demo !== true && menuDue(row, now.getTime()))
    .filter((row: any) => !selectedIds.has(String(row.id)))
    .slice(0, menuDiscoveryLimit);
  const candidates = [...primaryCandidates, ...menuCandidates];

  const counters = {
    selected: candidates.length, concurrency, textSearchLimit, menuDiscoveryLimit, menuContentLimit,
    googleCalls: 0, googleSucceeded: 0, googleFailed: 0, googleTextSearchCalls: 0, googleTextSearchMatched: 0, googleTextSearchNoMatch: 0,
    googleDetailsCalls: 0, googleDeferred: 0, googleNoDataCooldowns: 0, cachedHoursFilled: 0, hoursFilled: 0, websitesFilled: 0, phonesFilled: 0,
    reservationAttempted: 0, reservationFound: 0, reservationNotFound: 0, reservationBlocked: 0, reservationFailed: 0, reservationRecovered: 0,
    reservationProviderCounts: {} as Record<string, number>, reservationRetryFailed: 0, reservationRetryBlocked: 0, reservationRetryNoWebsite: 0,
    menuAttempted: 0, menuFound: 0, menuNotFound: 0, menuBlocked: 0, menuFailed: 0, menuIntelligenceApplied: 0, menuIntelligenceUnchanged: 0, menuSkippedManaged: 0,
    embeddingsMarkedStale: 0,
    openTableApiEnabled: openTableAdapter.enabled, openTableApiConfigured: openTableAdapter.configured, openTableApiAttempted: 0, openTableApiFound: 0, openTableApiSkipped: 1,
    managedCoreSkipped: 0, failed: 0,
  };
  let textSearchesStarted = 0;
  let menuDiscoveriesStarted = 0;
  let menuContentStarted = 0;

  const processRow = async (row: any) => {
    const update: Record<string, unknown> = { gap_repair_last_checked_at: new Date().toISOString(), gap_repair_status: "checked", gap_repair_error: null };
    let retryHours = 24 * 30;
    let googleAttempts = 0;
    let menuIntelligenceChanged = false;
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
      const googleDue = !row.gap_repair_google_next_attempt_at || new Date(row.gap_repair_google_next_attempt_at).getTime() <= Date.now();
      let placeId = String(row.google_place_id || "").trim() || null;

      if (needsCore && !placeId && !isManaged && googleDue) {
        if (textSearchesStarted >= textSearchLimit) {
          counters.googleDeferred += 1;
        } else {
          textSearchesStarted += 1;
          googleAttempts += 1;
          counters.googleCalls += 1;
          counters.googleTextSearchCalls += 1;
          update.gap_repair_google_calls = Number(row.gap_repair_google_calls || 0) + googleAttempts;
          const match = await googleTextSearch(row, googleKey);
          counters.googleSucceeded += 1;
          if (match?.id) {
            placeId = match.id;
            update.google_place_id = match.id;
            counters.googleTextSearchMatched += 1;
          } else {
            counters.googleTextSearchNoMatch += 1;
            update.gap_repair_google_next_attempt_at = new Date(Date.now() + GOOGLE_NO_DATA_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
            counters.googleNoDataCooldowns += 1;
          }
        }
      }

      if (needsCore && placeId && !isManaged && googleDue) {
        googleAttempts += 1;
        counters.googleCalls += 1;
        counters.googleDetailsCalls += 1;
        update.gap_repair_google_calls = Number(row.gap_repair_google_calls || 0) + googleAttempts;
        const place = await googleDetails(placeId, googleKey);
        counters.googleSucceeded += 1;
        const normalizedHours = normalizeGoogleHours(place.regularOpeningHours || place.regular_opening_hours);
        if (blank(row.operating_hours) && blank(update.operating_hours) && normalizedHours) {
          update.operating_hours = normalizedHours; update.google_regular_opening_hours = place.regularOpeningHours || place.regular_opening_hours || null;
          update.google_current_opening_hours = place.currentOpeningHours || place.current_opening_hours || null; update.hours_source = "google_places_details_unified_repair";
          update.hours_confidence = "verified"; update.hours_backfill_status = "success"; update.hours_last_backfilled_at = new Date().toISOString(); counters.hoursFilled += 1;
        }
        if (blank(row.website) && place.websiteUri) { update.website = place.websiteUri; counters.websitesFilled += 1; }
        const phone = place.nationalPhoneNumber || place.internationalPhoneNumber; if (blank(row.phone) && phone) { update.phone = phone; counters.phonesFilled += 1; }
        const coreStillMissing = (blank(row.operating_hours) && blank(update.operating_hours)) || (blank(row.website) && blank(update.website)) || (blank(row.phone) && blank(update.phone));
        if (coreStillMissing) {
          update.gap_repair_google_next_attempt_at = new Date(Date.now() + GOOGLE_NO_DATA_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
          counters.googleNoDataCooldowns += 1;
        } else update.gap_repair_google_next_attempt_at = null;
      } else if (needsCore && placeId && !isManaged && !googleDue) counters.googleDeferred += 1;
      else if (needsCore && isManaged) counters.managedCoreSkipped += 1;

      const website = String(update.website || row.website || "").trim();
      const alreadyHasReservation = !blank(row.external_reservation_url) || !blank(row.reservation_url) || !blank(row.reservation_link) || !blank(row.booking_url);
      const reservationStatus = String(row.reservation_discovery_status || "");
      const retryNoWebsite = reservationStatus === "no_website" && Boolean(website);
      const unclassifiedWithWebsite = !reservationStatus && Boolean(website);
      const needsReservationDiscovery = !alreadyHasReservation && (!row.reservation_discovery_checked_at || ["failed", "blocked"].includes(reservationStatus) || retryNoWebsite || unclassifiedWithWebsite);
      if (needsReservationDiscovery) {
        if (reservationStatus === "failed") counters.reservationRetryFailed += 1;
        else if (reservationStatus === "blocked") counters.reservationRetryBlocked += 1;
        else if (retryNoWebsite) counters.reservationRetryNoWebsite += 1;

        if (!website) {
          update.reservation_discovery_status = "no_website"; update.reservation_discovery_source = "unified_gap_repair"; update.reservation_discovery_notes = "No website available for free discovery"; update.reservation_discovery_checked_at = new Date().toISOString();
        } else {
          counters.reservationAttempted += 1;
          const discovery = await discoverReservation(website); update.reservation_discovery_status = discovery.status; update.reservation_discovery_source = "website_crawl";
          update.reservation_discovery_notes = discovery.note; update.reservation_discovery_checked_at = new Date().toISOString(); update.reservation_last_checked_at = new Date().toISOString();
          if (discovery.match) {
            const match = discovery.match; update.external_reservation_url = match.url; update.reservation_url = match.url; update.reservation_link = match.url;
            update.reservation_provider_url = match.url; update.reservation_external_url = match.url; update.reservation_platform_url = match.url;
            update.reservation_provider = match.provider; update.reservation_provider_name = match.provider; update.reservation_platform = match.provider;
            update.reservation_provider_status = "discovered"; update.reservation_source = "external"; update.reservation_source_url = website;
            counters.reservationFound += 1;
            counters.reservationProviderCounts[match.provider] = (counters.reservationProviderCounts[match.provider] || 0) + 1;
            if (["failed", "blocked", "no_website"].includes(reservationStatus)) counters.reservationRecovered += 1;
          } else if (discovery.status === "not_found") counters.reservationNotFound += 1;
          else if (discovery.status === "blocked") { counters.reservationBlocked += 1; retryHours = 24 * 7; }
          else { counters.reservationFailed += 1; retryHours = 24; }
        }
      }

      const rowForMenu = { ...row, ...update, website };
      if (String(row.location_type || "").toLowerCase() === "restaurant" && isManaged && menuDue({ ...row, profile_managed_by: null, profile_manual_lock: false }, Date.now())) {
        counters.menuSkippedManaged += 1;
      }
      if (website && !isManaged && menuDue(rowForMenu, Date.now()) && menuDiscoveriesStarted < menuDiscoveryLimit) {
        menuDiscoveriesStarted += 1;
        counters.menuAttempted += 1;
        const analyzeContent = menuContentStarted < menuContentLimit;
        if (analyzeContent) menuContentStarted += 1;
        const discovery = await discoverMenu(website, {
          knownMenuUrl: String(row.menu_url || "").trim() || null,
          analyzeContent,
        });
        const checkedAt = new Date().toISOString();
        update.menu_discovery_status = discovery.status;
        update.menu_discovery_checked_at = checkedAt;
        update.menu_discovery_confidence = discovery.confidence;
        update.menu_discovery_error = discovery.status === "failed" || discovery.status === "blocked" ? discovery.note : null;

        if (discovery.status === "found" && discovery.menuUrl) {
          counters.menuFound += 1;
          if (!protectedMenuUrl(row) || !row.menu_url) {
            update.menu_url = discovery.menuUrl;
            update.menu_url_source = discovery.source || "website_crawl";
          }
          if (discovery.intelligence) {
            const intelligence = discovery.intelligence;
            const changed = intelligence.contentHash !== String(row.menu_content_hash || "") || String(row.menu_intelligence_version || "") !== intelligence.version;
            update.menu_intelligence_checked_at = checkedAt;
            update.menu_intelligence_version = intelligence.version;
            update.menu_content_hash = intelligence.contentHash;
            if (changed) {
              const searchKeywords = uniqueMerge(row.search_keywords, intelligence.searchKeywords);
              const semanticTags = uniqueMerge(row.semantic_tags, intelligence.semanticTags);
              const intentTags = uniqueMerge(row.intent_tags, intelligence.intentTags);
              const signatureItems = uniqueMerge(row.signature_items, intelligence.signatureItems);
              const specialFeatures = uniqueMerge(row.special_features, intelligence.featureTerms, intelligence.dietaryTerms);
              update.search_keywords = searchKeywords;
              update.semantic_tags = semanticTags;
              update.intent_tags = intentTags;
              update.signature_items = signatureItems;
              update.special_features = specialFeatures;
              if (blank(row.cuisine) && intelligence.cuisineTerms[0]) update.cuisine = intelligence.cuisineTerms[0];
              if (blank(row.cuisine_type) && intelligence.cuisineTerms[0]) update.cuisine_type = intelligence.cuisineTerms[0];
              update.needs_semantic_refresh = true;
              const sources = jsonObject(row.profile_field_sources);
              update.profile_field_sources = {
                ...sources,
                first_party_menu: {
                  source: "official_website_menu",
                  url: intelligence.sourceUrl,
                  confidence: discovery.confidence,
                  fields: ["signature_items", "search_keywords", "special_features", "semantic_tags", "intent_tags"],
                  checked_at: checkedAt,
                  version: intelligence.version,
                },
              };
              const metadata = jsonObject(row.metadata);
              update.metadata = {
                ...metadata,
                first_party_menu_intelligence: {
                  source_url: intelligence.sourceUrl,
                  content_hash: intelligence.contentHash,
                  confidence: discovery.confidence,
                  signature_items: intelligence.signatureItems,
                  food_terms: intelligence.foodTerms,
                  dietary_terms: intelligence.dietaryTerms,
                  meal_periods: intelligence.mealPeriods,
                  drink_terms: intelligence.drinkTerms,
                  feature_terms: intelligence.featureTerms,
                  cuisine_terms: intelligence.cuisineTerms,
                  checked_at: checkedAt,
                  version: intelligence.version,
                },
              };
              menuIntelligenceChanged = true;
              counters.menuIntelligenceApplied += 1;
            } else {
              counters.menuIntelligenceUnchanged += 1;
            }
          }
        } else if (discovery.status === "not_found") counters.menuNotFound += 1;
        else if (discovery.status === "blocked") counters.menuBlocked += 1;
        else counters.menuFailed += 1;
      }

      update.gap_repair_next_attempt_at = new Date(Date.now() + retryHours * 60 * 60 * 1000).toISOString();
      const { error: updateError } = await supabase.from("locations").update(update).eq("id", row.id); if (updateError) throw updateError;
      if (menuIntelligenceChanged) {
        const stale = await supabase.from("location_search_embeddings").update({ status: "stale", error_message: null }).eq("location_id", row.id).eq("status", "ready");
        if (!stale.error) counters.embeddingsMarkedStale += 1;
      }
    } catch (error) {
      counters.failed += 1;
      if (googleAttempts > 0) counters.googleFailed += 1;
      const status = Number((error as any)?.status || 0); const retry = status === 429 ? 6 : status >= 500 ? 12 : 24;
      const failedUpdate: Record<string, unknown> = { gap_repair_status: "failed", gap_repair_error: errorMessage(error), gap_repair_last_checked_at: new Date().toISOString(), gap_repair_next_attempt_at: new Date(Date.now() + retry * 60 * 60 * 1000).toISOString() };
      if (googleAttempts > 0) failedUpdate.gap_repair_google_calls = Number(row.gap_repair_google_calls || 0) + googleAttempts;
      await supabase.from("locations").update(failedUpdate).eq("id", row.id);
    }
  };

  for (let index = 0; index < candidates.length; index += concurrency) {
    const wave = candidates.slice(index, index + concurrency);
    await Promise.all(wave.map(processRow));
  }

  return json({ success: true, ...counters });
});
