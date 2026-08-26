import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type Row = Record<string, any>;
type Intent = "address" | "hours" | "directions" | "phone" | "website" | "profile" | "info";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WORKER_SECRET = Deno.env.get("WORKER_INTERNAL_SECRET") || "";
const SITE_URL = (Deno.env.get("SITE_URL") || "https://theouthaven.com").replace(/\/$/, "");
const SHORT_BASE = (Deno.env.get("SHORT_LINK_BASE_URL") || "https://outhvn.com").replace(/\/$/, "");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
const LOCATION_SELECT = "id,source_table,location_type,restaurant_name,activity_name,name,business_name,address,formatted_address,geocoded_address,street_address,address_line_1,address_line_2,city,state,zip_code,phone,website,website_url,google_website_uri,google_maps_url,latitude,longitude,operating_hours,special_hours,google_regular_opening_hours,google_current_opening_hours,hours,hours_raw,hours_confidence,hours_source,is_hidden,is_searchable,status,data_status";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CONTEXT_TTL_MS = 24 * 60 * 60 * 1000;
const PLAN_CONTEXT_MAX_MS = 60 * 24 * 60 * 60 * 1000;
const BOOKING_REPLY_TTL_MS = 48 * 60 * 60 * 1000;

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  if (!secureCompare(request.headers.get("x-worker-secret") || "", WORKER_SECRET)) return json({ success: false, error: "Unauthorized" }, 401);

  try {
    const body = await request.json().catch(() => ({}));
    const operation = String(body.operation || "inbound");

    if (operation === "inbound") {
      const from = normalizePhone(body.from);
      const text = String(body.body || "").trim();
      if (!from || !text) return json({ success: true, handled: false });
      return json({ success: true, ...(await processInbound(from, text)) });
    }

    if (operation === "seed-plan") {
      const result = await seedPlanContext({
        phone: body.phone || body.from,
        outingId: body.outingId,
        restaurantLocationId: body.restaurantLocationId,
        activityLocationId: body.activityLocationId,
        plannedFor: body.plannedFor,
      });
      return json({ success: true, ...result });
    }

    if (operation === "health") return json({ success: true, handled: true, action: "health" });
    return json({ success: false, error: "Unsupported operation" }, 400);
  } catch (error) {
    console.error("CONCIERGE_ROUTER_ERROR", error);
    return json({ success: false, handled: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function seedPlanContext(input: {
  phone: unknown;
  outingId?: unknown;
  restaurantLocationId?: unknown;
  activityLocationId?: unknown;
  plannedFor?: unknown;
}) {
  const phone = normalizePhone(input.phone);
  if (!phone) return { handled: false, action: "plan_context_missing_phone" };

  const restaurantId = isUuid(input.restaurantLocationId) ? String(input.restaurantLocationId) : null;
  const activityId = isUuid(input.activityLocationId) ? String(input.activityLocationId) : null;
  const ids = [...new Set([restaurantId, activityId].filter(Boolean) as string[])];
  if (!ids.length) return { handled: false, action: "plan_context_no_locations" };

  const locations = (await Promise.all(ids.map((id) => getLocation(id)))).filter(Boolean) as Row[];
  if (!locations.length) return { handled: false, action: "plan_context_locations_not_found" };

  const validIds = locations.map((row) => String(row.id));
  const validRestaurantId = restaurantId && validIds.includes(restaurantId) ? restaurantId : null;
  const validActivityId = activityId && validIds.includes(activityId) ? activityId : null;
  const now = new Date();
  const planned = typeof input.plannedFor === "string" && !Number.isNaN(Date.parse(input.plannedFor)) ? new Date(input.plannedFor) : null;
  const desiredExpiry = planned ? planned.getTime() + 24 * 60 * 60 * 1000 : now.getTime() + 7 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Math.min(Math.max(desiredExpiry, now.getTime() + 48 * 60 * 60 * 1000), now.getTime() + PLAN_CONTEXT_MAX_MS));
  const metadata: Row = {
    source: "plan_text",
    outing_id: isUuid(input.outingId) ? String(input.outingId) : null,
    plan_restaurant_location_id: validRestaurantId,
    plan_activity_location_id: validActivityId,
    plan_location_ids: validIds,
    plan_locations: locations.map((row) => ({ id: row.id, name: locationName(row), city: row.city || null, role: row.id === validRestaurantId ? "restaurant" : row.id === validActivityId ? "activity" : "stop" })),
  };

  const { error } = await supabase.from("concierge_sms_context").upsert({
    phone_e164: phone,
    current_location_id: validIds.length === 1 ? validIds[0] : null,
    candidate_location_ids: validIds,
    last_intent: null,
    last_query: null,
    metadata,
    expires_at: expiresAt.toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: "phone_e164" });
  if (error) throw error;

  return { handled: true, action: "plan_context_seeded", locationCount: validIds.length, expiresAt: expiresAt.toISOString() };
}

async function processInbound(phone: string, text: string) {
  const context = await loadContext(phone);
  const hasLocationContext = Boolean(context?.current_location_id || (Array.isArray(context?.candidate_location_ids) && context.candidate_location_ids.length));
  const detected = detectIntent(text, hasLocationContext);
  const selection = await resolveCandidateSelection(text, context);
  const planTarget = detected ? await resolvePlanContextTarget(text, context) : null;
  const selected = selection?.location || planTarget;
  const intent = (selection?.intent || detected?.intent || null) as Intent | null;

  if (intent) {
    return handleLocationInfo(
      phone,
      text,
      intent,
      selected ? null : selection?.query ?? detected?.query ?? null,
      context,
      selected || null,
    );
  }

  const activeReview = await hasActiveReview(phone);
  const pendingBooking = await activeBookingPrompt(phone);
  const bookingAnswer = parseYesNo(text);
  if (pendingBooking && bookingAnswer !== null && !activeReview) return handleBookingDecision(pendingBooking, bookingAnswer);

  if (!activeReview && wantsReplacement(text)) {
    const failed = await recentFailedBooking(phone);
    if (failed) return handleReplacement(failed);
  }

  if (pendingBooking && !activeReview) {
    const location = await getLocation(pendingBooking.location_id);
    return {
      handled: true,
      action: "external_booking_clarification",
      locationId: pendingBooking.location_id,
      reply: `Just reply YES if you booked ${locationName(location)}, or NO if you weren't able to book it.`,
    };
  }

  return { handled: false };
}

async function resolvePlanContextTarget(text: string, context: Row | null) {
  if (!context) return null;
  const metadata = context.metadata && typeof context.metadata === "object" ? context.metadata : {};
  const restaurantId = isUuid(metadata.plan_restaurant_location_id) ? String(metadata.plan_restaurant_location_id) : null;
  const activityId = isUuid(metadata.plan_activity_location_id) ? String(metadata.plan_activity_location_id) : null;
  const lower = text.toLowerCase();

  if (restaurantId && /\b(restaurant|dinner|lunch|brunch|breakfast|food|meal|first stop)\b/.test(lower)) return getLocation(restaurantId);
  if (activityId && /\b(activity|thing to do|second stop|after dinner|afterward|afterwards)\b/.test(lower)) return getLocation(activityId);

  const candidates = await getContextCandidates(context);
  for (const row of candidates) {
    const name = normalizeWords(locationName(row));
    if (name && normalizeWords(text).includes(name)) return row;
  }
  return null;
}

async function handleLocationInfo(phone: string, originalText: string, intent: Intent, query: string | null, context: Row | null, selected: Row | null) {
  let location = selected;
  if (!location && query) {
    const matches = await findLocations(query);
    if (!matches.length) {
      return { handled: true, action: "location_info_not_found", reply: "I couldn't confidently find that location. Send me the exact location name, and the neighborhood or city if needed." };
    }
    const exactMatches = exactNameMatches(matches, query);
    if (exactMatches.length > 1 || (exactMatches.length === 0 && matches.length > 1)) {
      const choices = (exactMatches.length > 1 ? exactMatches : matches).slice(0, 4);
      await saveContext(phone, null, choices.map((row) => row.id), intent, query, { awaiting_location_selection: true });
      return {
        handled: true,
        action: "location_info_disambiguation",
        reply: `I found a few matches:\n${formatChoices(choices)}\nReply with the number you mean.`,
      };
    }
    location = exactMatches[0] || matches[0];
  }

  if (!location && context?.current_location_id && new Date(context.expires_at || 0).getTime() > Date.now()) {
    location = await getLocation(context.current_location_id);
  }

  if (!location) {
    const candidates = await getContextCandidates(context);
    if (candidates.length === 1) {
      location = candidates[0];
    } else if (candidates.length > 1) {
      await saveContext(phone, null, candidates.map((row) => row.id), intent, query, { awaiting_location_selection: true });
      return {
        handled: true,
        action: "location_info_plan_disambiguation",
        reply: `Which stop do you mean?\n${formatChoices(candidates)}\nReply with the number, or say restaurant or activity.`,
      };
    }
  }

  if (!location) {
    return { handled: true, action: "location_info_needs_location", reply: "Sure — which location are you asking about? Send me the name." };
  }

  const profile = await ensureShortLink(location, "profile");
  const name = locationName(location);
  let reply = "";

  if (intent === "address") {
    const address = locationAddress(location);
    reply = address ? `${name} is at ${address}.` : `I don't have a verified address for ${name} yet.`;
  } else if (intent === "hours") {
    const requestedDay = dayFromText(originalText);
    const hours = hoursForDay(location, requestedDay);
    reply = hours ? `${name} — ${hours}.` : `I don't have verified hours for ${name} right now.`;
  } else if (intent === "directions") {
    const directions = await ensureShortLink(location, "directions");
    const address = locationAddress(location);
    reply = `${address ? `${name}: ${address}. ` : ""}Directions: ${directions}`;
  } else if (intent === "phone") {
    reply = location.phone ? `${name}: ${location.phone}.` : `I don't have a verified phone number for ${name} right now.`;
  } else if (intent === "website") {
    const website = firstString(location.website, location.website_url, location.google_website_uri);
    reply = website ? `${name}'s website: ${website}` : `I don't have a verified website for ${name} right now.`;
  } else if (intent === "profile") {
    reply = `Here's ${name} on TheOutHaven: ${profile}`;
  } else {
    const parts = [locationAddress(location), hoursForDay(location, dayFromText(originalText)), location.phone].filter(Boolean);
    reply = parts.length ? `${name}: ${parts.join(" • ")}.` : `Here's what I have for ${name}.`;
  }

  if (intent !== "profile") reply = `${reply}\nTheOutHaven profile: ${profile}`;
  await saveContext(phone, location.id, contextCandidateIds(context), intent, query || locationName(location), { last_location_name: name });
  return { handled: true, action: `location_info_${intent}`, locationId: location.id, reply };
}

async function resolveCandidateSelection(text: string, context: Row | null) {
  const candidates: string[] = contextCandidateIds(context);
  if (!candidates.length || !context?.last_intent) return null;
  const match = text.trim().match(/^(?:#?\s*)?([1-4])(?:\b|\.)/);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  const id = candidates[index];
  if (!id) return null;
  const location = await getLocation(id);
  if (!location) return null;
  return { location, intent: context.last_intent as Intent, query: context.last_query || locationName(location) };
}

function detectIntent(text: string, hasContext: boolean): { intent: Intent; query: string | null } | null {
  const value = text.trim();
  let intent: Intent | null = null;
  if (/\b(direction|directions|map|maps|route|get there|how do i get|how to get)\b/i.test(value)) intent = "directions";
  else if (/\b(address|located|location|where is|where's)\b/i.test(value)) intent = "address";
  else if (/\b(hours?|open|opens|opening|close|closes|closing|what time)\b/i.test(value)) intent = "hours";
  else if (/\b(phone|telephone|number|call them|call it)\b/i.test(value)) intent = "phone";
  else if (/\b(website|web site|site)\b/i.test(value)) intent = "website";
  else if (/\b(profile|theouthaven page|their page|link to)\b/i.test(value)) intent = "profile";
  else if (/\b(info|information|tell me about|details about)\b/i.test(value)) intent = "info";
  else if (hasContext && dayFromText(value)) intent = "hours";
  if (!intent) return null;

  let query = value
    .replace(/\b(please|can you|could you|would you|send me|give me|tell me|show me|i need|i want|what is|what's|whats|what are|where is|where's|wheres|how do i|get me)\b/gi, " ")
    .replace(/\b(the|an|a|their|its|it|there|that place|this place)\b/gi, " ")
    .replace(/\b(address|directions?|maps?|route|hours?|open|opens|opening|close|closes|closing|phone|telephone|number|website|web site|profile|information|info|details|today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|time)\b/gi, " ")
    .replace(/[?!.:,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  query = query.replace(/^(for|to|of|at)\s+/i, "").trim();
  const inSplit = query.match(/^(.+?)\s+in\s+.+$/i);
  if (inSplit?.[1]) query = inSplit[1].trim();
  if (!query || /^(them|it|there|restaurant|activity|dinner|meal|food)$/i.test(query)) query = "";
  return { intent, query: query || null };
}

async function findLocations(query: string) {
  const clean = query.trim().replace(/[%_]/g, "");
  if (!clean) return [] as Row[];
  const columns = ["name", "restaurant_name", "activity_name", "business_name"];
  const found = new Map<string, Row>();
  for (const column of columns) {
    const { data, error } = await supabase.from("locations").select(LOCATION_SELECT).ilike(column, `%${clean}%`).limit(8);
    if (error) throw error;
    for (const row of data || []) if (row?.id && !found.has(row.id) && usableLocation(row)) found.set(row.id, row as Row);
    if (found.size >= 8) break;
  }
  return [...found.values()].sort((a, b) => matchScore(b, clean) - matchScore(a, clean)).slice(0, 8);
}

function usableLocation(row: Row) {
  if (row.is_hidden === true) return false;
  if (row.status && ["archived", "deleted", "closed"].includes(String(row.status).toLowerCase())) return false;
  return true;
}

function matchScore(row: Row, query: string) {
  const q = normalizeWords(query);
  const name = normalizeWords(locationName(row));
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  return 10;
}

function exactNameMatches(rows: Row[], query: string) {
  const q = normalizeWords(query);
  return rows.filter((row) => normalizeWords(locationName(row)) === q);
}

function formatChoices(rows: Row[]) {
  return rows.slice(0, 4).map((row, index) => `${index + 1}) ${locationName(row)}${row.city ? ` — ${row.city}` : ""}`).join("\n");
}

function contextCandidateIds(context: Row | null) {
  return Array.isArray(context?.candidate_location_ids) ? context.candidate_location_ids.filter((id: unknown) => isUuid(id)).map(String) : [];
}

async function getContextCandidates(context: Row | null) {
  const ids = contextCandidateIds(context);
  if (!ids.length) return [] as Row[];
  const rows = (await Promise.all(ids.slice(0, 4).map((id) => getLocation(id)))).filter(Boolean) as Row[];
  return rows;
}

async function loadContext(phone: string) {
  const { data, error } = await supabase.from("concierge_sms_context").select("*").eq("phone_e164", phone).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.expires_at || 0).getTime() <= Date.now()) {
    await supabase.from("concierge_sms_context").delete().eq("phone_e164", phone);
    return null;
  }
  return data as Row;
}

async function saveContext(phone: string, locationId: string | null, candidates: string[], intent: Intent, query: string | null, metadataPatch: Row) {
  const now = new Date();
  const { data: existing } = await supabase.from("concierge_sms_context").select("metadata,expires_at").eq("phone_e164", phone).maybeSingle();
  const existingMetadata = existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
  const existingExpiry = existing?.expires_at && new Date(existing.expires_at).getTime() > now.getTime() ? existing.expires_at : null;
  const { error } = await supabase.from("concierge_sms_context").upsert({
    phone_e164: phone,
    current_location_id: locationId,
    candidate_location_ids: candidates,
    last_intent: intent,
    last_query: query,
    metadata: { ...existingMetadata, ...metadataPatch },
    expires_at: existingExpiry || new Date(now.getTime() + CONTEXT_TTL_MS).toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: "phone_e164" });
  if (error) throw error;
}

async function getLocation(id: string) {
  if (!isUuid(id)) return null;
  const { data, error } = await supabase.from("locations").select(LOCATION_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Row | null;
}

function locationName(row: Row | null) {
  return firstString(row?.name, row?.business_name, row?.restaurant_name, row?.activity_name) || "that location";
}

function locationAddress(row: Row) {
  const direct = firstString(row.formatted_address, row.geocoded_address, row.address);
  if (direct) return direct;
  const street = [firstString(row.street_address, row.address_line_1), row.address_line_2].filter(Boolean).join(" ").trim();
  return [street, row.city, row.state, row.zip_code].filter(Boolean).join(", ") || null;
}

function publicLocationType(row: Row) {
  const source = String(row.source_table || "").toLowerCase();
  const type = String(row.location_type || "").toLowerCase();
  if (source.includes("restaurant") || /restaurant|food|bar|cafe|dining/.test(type)) return "restaurants";
  if (source.includes("activit") || /activity|experience|attraction|bowling|museum|karaoke|arcade|spa/.test(type)) return "activities";
  return "locations";
}

async function ensureShortLink(row: Row, kind: "profile" | "directions") {
  const entityId = `${row.id}:${kind}`;
  const linkType = kind === "profile" ? "concierge_location_profile" : "concierge_location_directions";
  const destination = kind === "profile"
    ? `${SITE_URL}/locations/${publicLocationType(row)}/${encodeURIComponent(row.id)}`
    : googleDirectionsUrl(row);
  const { data: existing, error } = await supabase.from("short_links")
    .select("id,code,destination_url").eq("link_type", linkType).eq("entity_type", "location").eq("entity_id", entityId).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (existing) {
    if (existing.destination_url !== destination) await supabase.from("short_links").update({ destination_url: destination, updated_at: new Date().toISOString() }).eq("id", existing.id);
    return `${SHORT_BASE}/${existing.code}`;
  }
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomCode();
    const { error: insertError } = await supabase.from("short_links").insert({
      code,
      destination_url: destination,
      link_type: linkType,
      entity_type: "location",
      entity_id: entityId,
      title: `${locationName(row)} ${kind}`,
      metadata: { system_managed: true, source: "concierge_router", location_id: row.id, kind },
      is_active: true,
    });
    if (!insertError) return `${SHORT_BASE}/${code}`;
    if (insertError.code !== "23505") throw insertError;
  }
  return destination;
}

function googleDirectionsUrl(row: Row) {
  const address = locationAddress(row);
  const coordinates = Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)) ? `${row.latitude},${row.longitude}` : "";
  const destination = address || coordinates || locationName(row);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function hoursForDay(row: Row, requestedDay: string | null) {
  const day = requestedDay || currentNyDay();
  const candidates = [row.google_current_opening_hours, row.special_hours, row.google_regular_opening_hours, row.operating_hours, row.hours, row.hours_raw];
  for (const value of candidates) {
    const result = extractDayHours(value, day);
    if (result) return `${day}: ${result}`;
  }
  return null;
}

function extractDayHours(value: unknown, day: string) {
  if (!value) return null;
  let parsed: any = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { parsed = value; }
  }
  if (typeof parsed === "string") {
    const line = parsed.split(/\n|;/).map((x) => x.trim()).find((x) => x.toLowerCase().startsWith(day.toLowerCase()));
    return line ? line.replace(new RegExp(`^${day}:?\\s*`, "i"), "").trim() : null;
  }
  const descriptions = parsed?.weekdayDescriptions || parsed?.weekday_descriptions || parsed?.weekday_text;
  if (Array.isArray(descriptions)) {
    const line = descriptions.find((x: unknown) => String(x).toLowerCase().startsWith(day.toLowerCase()));
    if (line) return String(line).replace(new RegExp(`^${day}:?\\s*`, "i"), "").trim();
  }
  if (typeof parsed === "object") {
    const direct = parsed[day.toLowerCase()] ?? parsed[day] ?? parsed[day.slice(0, 3).toLowerCase()];
    if (Array.isArray(direct)) return direct.join(", ");
    if (typeof direct === "string") return direct;
  }
  return null;
}

function dayFromText(text: string) {
  const lower = text.toLowerCase();
  for (const day of DAYS) if (lower.includes(day.toLowerCase())) return day;
  if (/\btomorrow\b/.test(lower)) {
    const ny = nyDate();
    return DAYS[(ny.getUTCDay() + 1) % 7];
  }
  if (/\btoday\b|\btonight\b/.test(lower)) return currentNyDay();
  return null;
}

function currentNyDay() {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(new Date());
}

function nyDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 12));
}

async function hasActiveReview(phone: string) {
  const { data, error } = await supabase.from("sms_review_conversations").select("id").eq("phone_e164", phone).eq("status", "active").limit(1).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function activeBookingPrompt(phone: string) {
  const cutoff = new Date(Date.now() - BOOKING_REPLY_TTL_MS).toISOString();
  const { data, error } = await supabase.from("outing_external_bookings").select("*").eq("followup_phone", phone).eq("status", "started").not("followup_sent_at", "is", null).gte("followup_sent_at", cutoff).order("followup_sent_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as Row | null;
}

async function recentFailedBooking(phone: string) {
  const cutoff = new Date(Date.now() - BOOKING_REPLY_TTL_MS).toISOString();
  const { data, error } = await supabase.from("outing_external_bookings").select("*").eq("followup_phone", phone).eq("status", "failed").gte("failed_at", cutoff).order("failed_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as Row | null;
}

async function handleBookingDecision(booking: Row, booked: boolean) {
  const location = await getLocation(booking.location_id);
  const name = locationName(location);
  const now = new Date().toISOString();
  const patch = booked
    ? { status: "confirmed", confirmed_at: now, confirmation_source: "concierge_sms", failed_at: null, failure_source: null, updated_at: now }
    : { status: "failed", failed_at: now, failure_source: "concierge_sms", confirmed_at: null, confirmation_source: null, updated_at: now };
  const { error } = await supabase.from("outing_external_bookings").update(patch).eq("id", booking.id);
  if (error) throw error;
  const summary = await recomputeBookingSummary(booking.outing_id);
  await supabase.from("outings").update(booked ? {
    external_booking_status: "confirmed",
    external_booking_location_id: booking.location_id,
    external_booking_confirmed_at: now,
    external_booking_confirmation_source: "concierge_sms",
    external_booking_failed_at: null,
    external_booking_failure_source: null,
  } : {
    external_booking_status: "failed",
    external_booking_location_id: booking.location_id,
    external_booking_failed_at: now,
    external_booking_failure_source: "concierge_sms",
    external_booking_confirmed_at: null,
    external_booking_confirmation_source: null,
  }).eq("id", booking.outing_id);
  return booked
    ? { handled: true, action: "external_booking_confirmed", locationId: booking.location_id, reply: summary.complete ? `Perfect — I marked ${name} as booked. Your external bookings for this outing are confirmed.` : `Perfect — I marked ${name} as booked. I'll keep the rest of your outing as-is.` }
    : { handled: true, action: "external_booking_failed", locationId: booking.location_id, reply: `No problem — I won't mark ${name} as booked. If you want to replace just that stop without rebuilding the whole outing, reply REPLACE.` };
}

async function recomputeBookingSummary(outingId: string) {
  const { data, error } = await supabase.from("outing_external_bookings").select("id,status").eq("outing_id", outingId);
  if (error) throw error;
  const rows = data || [];
  const required = rows.length;
  const confirmed = rows.filter((row) => row.status === "confirmed").length;
  const complete = required > 0 && confirmed === required;
  await supabase.from("outings").update({ external_bookings_required_count: required, external_bookings_confirmed_count: confirmed, external_bookings_complete: complete }).eq("id", outingId);
  return { required, confirmed, complete };
}

async function handleReplacement(failed: Row) {
  const [{ data: outing }, location] = await Promise.all([
    supabase.from("outings").select("id,plan_access_token,metadata").eq("id", failed.outing_id).maybeSingle(),
    getLocation(failed.location_id),
  ]);
  const shortCode = typeof outing?.metadata?.short_code === "string" ? outing.metadata.short_code : null;
  const planUrl = shortCode ? `${SHORT_BASE}/${shortCode}?view=picks` : outing?.plan_access_token ? `${SITE_URL}/outings/guest/${encodeURIComponent(outing.plan_access_token)}` : `${SITE_URL}/create`;
  return { handled: true, action: "external_booking_replace_link_sent", locationId: failed.location_id, reply: `Absolutely — keep the rest of your outing and replace just ${locationName(location)}: ${planUrl}` };
}

function parseYesNo(text: string) {
  const value = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (/^(yes|y|yeah|yep|yea|sure|booked|done|confirmed|got it|i did|we did|i booked|we booked)\b/.test(value)) return true;
  if (/^(no|n|nope|nah|not yet|couldn.t|could not|didn.t|did not|wasn.t able|was not able|failed)\b/.test(value)) return false;
  return null;
}

function wantsReplacement(text: string) {
  return /^(replace|swap|change|change it|find another|another one|different one)\b/i.test(text.trim());
}

function normalizeWords(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizePhone(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value.trim());
}

function firstString(...values: unknown[]) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

function secureCompare(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
