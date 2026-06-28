import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendTemplatedEmail } from "@/lib/email/send";

export const MIRROR_DEMO_KEY = "real_location_mirror_demo";
export const MIRROR_DEMO_MODE = "real_location_mirror";
export const DEMO_LOCATION_NAME = "TheOutHaven Demo Lounge";
export const SAFE_DEMO_EMAILS = new Set(["demo-owner@theouthaven.com", "demo-events@theouthaven.com", "demo-reservations@theouthaven.com", "demo-customer@theouthaven.com", "demo-vip@theouthaven.com"]);
export type DemoStatus = "Ready" | "Partial" | "Missing" | "Needs setup" | "Not installed" | "Needs data" | "Hidden" | "Exposed" | "Not tested" | "Missing template";
export type DemoLink = { label: string; href: string; description?: string };
export type InsertSafeResult = { ok: boolean; table: string; insertedCount: number; skipped: boolean; reason?: string; data?: any[] };
export const demoMetadata = { demo: true, demo_key: MIRROR_DEMO_KEY, demo_mode: MIRROR_DEMO_MODE };
class DemoCenterError extends Error {}

function errorMessage(error: any) { return String(error?.message || error?.details || error?.hint || error || ""); }
function missingColumnName(error: any) { const msg = errorMessage(error); return msg.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+(?:of relation\s+"?[a-zA-Z0-9_]+"?\s+)?does not exist/i)?.[1] || msg.match(/Could not find the '([^']+)' column/i)?.[1] || null; }
function missingTable(error: any) { const msg = errorMessage(error); return /relation .* does not exist|table .* does not exist|Could not find the table/i.test(msg); }
function duplicateKey(error: any) { return /duplicate key|already exists|unique constraint/i.test(errorMessage(error)); }
function nullConstraintColumn(error: any) { return errorMessage(error).match(/null value in column "?([a-zA-Z0-9_]+)"? of relation "?locations"? violates not-null constraint/i)?.[1] || null; }
function schemaCacheIssue(error: any) { return /schema cache|Could not find the '[^']+' column|PGRST204/i.test(errorMessage(error)) || error?.code === "PGRST204"; }
function invalidValue(error: any) { return /invalid input value for enum|violates check constraint/i.test(errorMessage(error)); }
export function getSafeDemoLocationErrorDetail(error: any) {
  const msg = errorMessage(error);
  const nullColumn = nullConstraintColumn(error);
  const missingColumn = missingColumnName(error);
  if (missingTable(error)) return "missing table";
  if (nullColumn) return `Missing required field: locations.${nullColumn}`;
  if (missingColumn) return schemaCacheIssue(error) ? "Database schema cache needs refresh" : `Missing required value for: locations.${missingColumn}`;
  if (invalidValue(error)) {
    const field = msg.match(/column "?([a-zA-Z0-9_]+)"?/i)?.[1];
    return field ? `Invalid value for: locations.${field}` : "invalid enum/status value";
  }
  if (duplicateKey(error)) return "duplicate key";
  if (schemaCacheIssue(error)) return "schema cache issue";
  return "Unknown Supabase insert error";
}
function demoLocationCreateFailed(error: any) {
  console.error("Demo location create failed", {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint
  });
}

export async function tableExists(table: string) { try { const { error } = await supabaseAdmin.from(table).select("id", { head: true, count: "exact" }).limit(1); return !error || !missingTable(error); } catch { return false; } }
async function countRows(table: string, locationId?: string) { try { if (!(await tableExists(table))) return null; let q = supabaseAdmin.from(table).select("id", { head: true, count: "exact" }); if (locationId) q = q.eq("location_id", locationId); const { count, error } = await q; return error ? null : count || 0; } catch { return null; } }
async function hasColumn(table: string, column: string) { try { const { error } = await supabaseAdmin.from(table).select(column, { head: true }).limit(1); return !error; } catch { return false; } }
function stripColumn(rows: Record<string, any>[], column: string) { return rows.map((row) => { const next = { ...row }; delete next[column]; return next; }); }

export async function insertSafe(table: string, input: Record<string, any> | Record<string, any>[]): Promise<InsertSafeResult> {
  const rows = Array.isArray(input) ? input : [input];
  if (!rows.length) return { ok: true, table, insertedCount: 0, skipped: false, data: [] };
  try {
    if (!(await tableExists(table))) return { ok: false, table, insertedCount: 0, skipped: true, reason: "Table is not installed." };
    let sanitized = rows;
    const removed: string[] = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { data, error } = await supabaseAdmin.from(table).insert(sanitized as any).select("*");
      if (!error) return { ok: true, table, insertedCount: data?.length || sanitized.length, skipped: false, data: data || [] };
      const column = missingColumnName(error);
      if (column && sanitized.some((row) => column in row)) { removed.push(column); sanitized = stripColumn(sanitized, column); continue; }
      if (duplicateKey(error)) return { ok: false, table, insertedCount: 0, skipped: true, reason: "Duplicate demo rows already exist." };
      if (missingTable(error)) return { ok: false, table, insertedCount: 0, skipped: true, reason: "Table is not installed." };
      return { ok: false, table, insertedCount: 0, skipped: true, reason: errorMessage(error) || "Insert skipped." };
    }
    return { ok: false, table, insertedCount: 0, skipped: true, reason: `Unsupported columns skipped: ${removed.join(", ")}` };
  } catch (error) { return { ok: false, table, insertedCount: 0, skipped: true, reason: errorMessage(error) || "Skipped because this module is not installed yet." }; }
}

export async function safeUpdateExistingColumns(table: string, idColumn: string, id: string, updates: Record<string, unknown>): Promise<{ applied: string[]; skipped: string[]; errors: string[] }> {
  const columns = Object.keys(updates); if (!columns.length) return { applied: [], skipped: [], errors: [] };
  const batch = await supabaseAdmin.from(table).update(updates as any).eq(idColumn, id).select(idColumn).limit(1);
  if (!batch.error) return { applied: columns, skipped: [], errors: [] };
  const result = { applied: [] as string[], skipped: [] as string[], errors: [] as string[] };
  for (const column of columns) {
    const { error } = await supabaseAdmin.from(table).update({ [column]: updates[column] } as any).eq(idColumn, id).select(idColumn).limit(1);
    if (error) { result.skipped.push(column); result.errors.push(`${column}: ${errorMessage(error)}`); } else result.applied.push(column);
  }
  return result;
}

async function deleteDemoRows(table: string, locationId: string) {
  const result = { table, deleted: false, skipped: false, reason: "" };
  try {
    if (!(await tableExists(table))) return { ...result, skipped: true, reason: "Table is not installed." };
    if (await hasColumn(table, "demo_key")) { await supabaseAdmin.from(table).delete().eq("demo_key", MIRROR_DEMO_KEY); return { ...result, deleted: true }; }
    if ((await hasColumn(table, "metadata")) && (await hasColumn(table, "location_id"))) { await supabaseAdmin.from(table).delete().eq("location_id", locationId).contains("metadata", { demo: true, demo_key: MIRROR_DEMO_KEY }); return { ...result, deleted: true }; }
    return { ...result, skipped: true, reason: "No demo metadata column available." };
  } catch (error) { return { ...result, skipped: true, reason: errorMessage(error) }; }
}

export function isSafeDemoEmail(email?: string | null, adminEmail?: string | null, confirmedAdminEmail = false) { const normalized = String(email || "").trim().toLowerCase(); if (!normalized) return false; if (SAFE_DEMO_EMAILS.has(normalized)) return true; return Boolean(confirmedAdminEmail && adminEmail && normalized === adminEmail.toLowerCase()); }
export function assertDemoRecord(record: any) { if (!record) throw new DemoCenterError("Demo record was not found."); const meta = record.metadata || {}; if (record.is_demo === true && record.demo_key === MIRROR_DEMO_KEY) return true; if (meta.demo === true && meta.demo_key === MIRROR_DEMO_KEY) return true; throw new DemoCenterError("This action can only change records tagged for the mirror demo."); }
export async function getMirrorDemoLocation() { try { const { data, error } = await supabaseAdmin.from("locations").select("*").eq("demo_key", MIRROR_DEMO_KEY).maybeSingle(); if (!error) return data || null; if (missingColumnName(error)) return null; return null; } catch { return null; } }

async function buildDemoLocationPayload(extra: Record<string, any> = {}) {
  const payload: any = {
    name: DEMO_LOCATION_NAME,
    address: "123 Demo Ave",
    city: "New York",
    state: "NY",
    is_demo: true,
    demo_key: MIRROR_DEMO_KEY,
    demo_mode: MIRROR_DEMO_MODE,
    is_searchable: false,
    metadata: demoMetadata,
    ...extra
  };
  const safeIfPresent: Record<string, any> = {
    location_name: DEMO_LOCATION_NAME,
    location_type: "restaurant",
    type: "restaurant",
    category: "Restaurant + Lounge + Activity",
    primary_category: "Restaurant + Lounge + Activity",
    status: "active",
    slug: "theouthaven-demo-lounge",
    latitude: 40.7505,
    longitude: -73.9934,
    lng: -73.9934,
    zip_code: "10001",
    postal_code: "10001",
    source: "demo",
    import_source: "demo",
    source_table: "locations",
    borough: "Manhattan",
    country: "US",
    active: true,
    is_hidden: true,
    quality_status: "needs_review",
    duplicate_status: "unique",
    data_status: "clean",
    public_visibility_tier: "hidden"
  };
  for (const [column, value] of Object.entries(safeIfPresent)) if (!(column in payload) && await hasColumn("locations", column)) payload[column] = value;
  return payload;
}

async function insertDemoLocationWithRequiredFallback(initialPayload: Record<string, any>) {
  const fallbackValues: Record<string, any> = { status: "active", source: "demo", location_type: "restaurant", type: "restaurant", category: "Restaurant + Lounge + Activity", primary_category: "Restaurant + Lounge + Activity", zip_code: "10001", postal_code: "10001", latitude: 40.7505, longitude: -73.9934, lng: -73.9934, borough: "Manhattan", country: "US", is_searchable: false, is_hidden: true, active: true, slug: "theouthaven-demo-lounge" };
  const payload = { ...initialPayload };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabaseAdmin.from("locations").insert(payload as any).select("*").single();
    if (!error) return data;
    demoLocationCreateFailed(error);
    const column = nullConstraintColumn(error);
    if (column && !(column in payload) && column in fallbackValues && await hasColumn("locations", column)) { payload[column] = fallbackValues[column]; continue; }
    const detail = getSafeDemoLocationErrorDetail(error);
    throw new DemoCenterError(detail);
  }
  throw new DemoCenterError("Unknown Supabase insert error");
}

export async function createOrRefreshMirrorDemoLocation(options: { seedModules?: boolean } = {}) {
  if (!(await hasColumn("locations", "demo_key"))) throw new DemoCenterError("The demo metadata migration is missing. Apply 20260627120000_unified_demo_center.sql, then refresh the Demo Center.");
  const existing = await getMirrorDemoLocation();
  const minimal = await buildDemoLocationPayload();
  let location = existing;
  if (location?.id) {
    const { data, error } = await supabaseAdmin.from("locations").update(minimal as any).eq("id", location.id).select("*").single();
    if (error) { demoLocationCreateFailed(error); throw new DemoCenterError(getSafeDemoLocationErrorDetail(error)); }
    location = data || location;
  } else {
    location = await insertDemoLocationWithRequiredFallback(minimal);
  }
  const optional: any = { zip_code: "10001", phone: "212-555-0199", website: "https://theouthaven.com", description: "TheOutHaven Demo Lounge is a sample Growth Pro location used to test menus, reservations, QR codes, offers, VIP signups, event leads, notifications, reviews, feedback, messaging, analytics, and staff training flows.", market: "NYC", location_type: "restaurant", primary_category: "Restaurant + Lounge + Activity", restaurant_name: DEMO_LOCATION_NAME, activity_name: DEMO_LOCATION_NAME, active: true, is_hidden: true, demo_visible_publicly: false, growth_pro_override: true, reservation_enabled: true, reservation_mode: "internal_booking", reservation_source: "theouthaven", external_reservation_url: "https://theouthaven.com/demo-reservation", reservation_phone: "212-555-0199", reservation_owner_email: "demo-reservations@theouthaven.com", updated_at: new Date().toISOString() };
  const optionalResult = await safeUpdateExistingColumns("locations", "id", location.id, optional);
  const refreshed = await getMirrorDemoLocation();
  location = refreshed || location;
  if (options.seedModules !== false) {
    try { await seedMirrorDemoData(location.id); }
    catch (error) { console.error("Demo Center optional module seed failed", error); }
  }
  revalidatePath("/admin/dashboard/settings/demo-center");
  return { ...location, demoWarnings: optionalResult.errors };
}

const pages = ["Food Menu", "Drinks & Hookah", "Birthday Packages", "Private Events", "Activity Pricing"];
const items = ["Demo Truffle Fries", "Demo Steak Tacos", "Demo Salmon Dinner", "Demo Signature Mocktail", "Demo Date Night Cocktail", "Demo Classic Hookah Package", "Demo Birthday Table Package", "Demo Private Room Package", "Demo Group Activity Package"];
export async function seedMirrorDemoData(locationId: string) {
  await resetMirrorDemoData(locationId, false);
  await insertSafe("location_branding_settings", { location_id: locationId, logo_url: "/theouthaven-icon.png", hero_image_url: "/og-image.png", brand_accent_color: "#e1062a", theme_key: "deep_red", metadata: demoMetadata });
  await insertSafe("location_offerings", { location_id: locationId, offers_food: true, offers_drinks: true, offers_hookah: true, offers_activities: true, offers_reservations: true, offers_private_events: true, offers_group_packages: true, offers_catering: true, offers_live_events: true, offers_tickets: true, offers_bottle_service: true, primary_offering_type: "hybrid", metadata: demoMetadata });
  const pageResult = await insertSafe("location_commerce_pages", pages.map((title, i) => ({ location_id: locationId, page_type: title.toLowerCase().replaceAll(" ", "_"), title, description: `${title} demo page for owner walkthroughs.`, sort_order: i, metadata: demoMetadata })));
  const firstPage = pageResult.data?.[0]?.id;
  if (firstPage) await insertSafe("location_commerce_items", items.map((name, i) => ({ location_id: locationId, commerce_page_id: firstPage, name, description: "Demo item seeded for realistic Growth Pro testing.", price: i < 3 ? "$18" : "$49+", sort_order: i, is_featured: i < 4, metadata: demoMetadata })));
  await insertSafe("location_qr_codes", ["main", "menu", "review", "check_in", "reservation", "event", "offer", "vip", "claim"].map((t) => ({ location_id: locationId, code: `${MIRROR_DEMO_KEY}_${t}`, qr_type: t, destination_path: getMirrorDemoLinks(locationId).find((l) => l.label.toLowerCase().includes(t.replace("_", " ")))?.href || `/locations/hybrid/${locationId}?demo=1`, label: `Demo ${t.replace("_", " ")} QR`, metadata: demoMetadata })));
  await insertSafe("location_offers", ["Birthday Dessert Perk", "Weekend Date Night Package", "Group Celebration Offer"].map((title) => ({ location_id: locationId, title, description: "Safe demo offer for claim flow testing.", offer_type: "demo", is_active: true, metadata: demoMetadata })));
  await insertSafe("location_vip_signups", ["Demo VIP Customer", "Demo SMS Subscriber", "Demo Birthday Guest"].map((name) => ({ location_id: locationId, name, email: "demo-vip@theouthaven.com", source: "demo_center", email_consent: true, sms_consent: false, metadata: demoMetadata })));
  await insertSafe("location_notification_recipients", [{ name: "Demo Owner", email: "demo-owner@theouthaven.com", role: "owner", is_primary: true, receives_all: true }, { name: "Demo Events", email: "demo-events@theouthaven.com", role: "events", receives_all: true }, { name: "Demo Reservations", email: "demo-reservations@theouthaven.com", role: "reservations", receives_all: true }].map((r) => ({ location_id: locationId, ...r, metadata: demoMetadata })));
  await insertSafe("location_notification_events", ["New private event lead", "New offer claim", "New VIP signup", "Low-rating private feedback", "SMS credits low", "QR scans increased this week", "Reservation request received"].map((title) => ({ location_id: locationId, event_type: title.toLowerCase().replaceAll(" ", "_"), title, message: "Demo notification generated by Demo Center.", metadata: demoMetadata })));
  await insertSafe("location_leads", ["birthday party for 12 guests", "corporate outing for 20 guests", "private hookah lounge request", "girls night group package request"].map((notes, i) => ({ location_id: locationId, customer_name: `Demo Lead ${i + 1}`, customer_email: "demo-events@theouthaven.com", guest_count: [12, 20, 8, 10][i], notes, status: "new", source: "demo_center", metadata: demoMetadata })));
  await insertSafe("location_private_feedback", [5, 3, 2].map((rating) => ({ location_id: locationId, customer_name: "Demo Customer", customer_email: "demo-customer@theouthaven.com", rating, feedback_text: `${rating}-star demo feedback`, source: "demo_center", metadata: demoMetadata })));
  await insertSafe("location_marketing_suggestions", ["Birthday package push", "Weekend date night offer", "VIP signup QR promo", "Private event flyer idea", "Brunch/happy hour campaign idea", "Review feedback follow-up idea", "Menu highlight idea"].map((title) => ({ location_id: locationId, title, description: "Demo marketing suggestion.", recommended_channel: "email", status: "new", metadata: demoMetadata })));
  await insertSafe("location_marketing_generations", ["Instagram caption", "SMS campaign draft", "email campaign draft", "flyer copy", "VIP signup promo", "event package promo"].map((goal) => ({ location_id: locationId, generation_type: "demo", channel: goal.includes("SMS") ? "sms" : "email", goal, generated_content: { text: goal }, metadata: demoMetadata })));
  await insertSafe("location_sms_credit_ledger", { location_id: locationId, credit_type: "included", credits_added: 100, credits_used: 22, credits_remaining: 78, source: "demo_center", metadata: demoMetadata });
  await seedDemoReservations(locationId);
  await insertSafe("location_analytics_events", ["profile_view", "search_appearance", "qr_scan", "menu_view", "offer_claim", "vip_signup", "event_lead_submitted", "reservation_requested", "reservation_confirmed", "reservation_checked_in", "reservation_completed", "reservation_cancelled", "reservation_no_show", "private_feedback_submitted", "marketing_generation_created", "email_campaign_sent", "sms_credits_used"].map((event_type) => ({ location_id: locationId, event_type, metadata: demoMetadata })));
}
export async function seedDemoReservations(locationId: string) { const rows = ["pending", "confirmed", "checked_in", "completed", "cancelled", "no_show"].map((status, i) => ({ location_id: locationId, customer_name: `Demo Reservation ${i + 1}`, customer_email: "demo-customer@theouthaven.com", customer_phone: "212-555-0199", party_size: i + 2, reservation_date: new Date(Date.now() + 86400000 * (i + 1)).toISOString().slice(0, 10), reservation_time: `${18 + i}:00`, status, source: "demo_center", is_demo: true, demo_key: MIRROR_DEMO_KEY, demo_mode: MIRROR_DEMO_MODE, metadata: demoMetadata })); const reservations = await insertSafe("reservations", rows); const legacy = await insertSafe("location_reservations", rows); return { reservations, legacy }; }
export async function resetMirrorDemoData(locationId?: string, stampLocation = true) { const loc = locationId ? { id: locationId } : await getMirrorDemoLocation(); if (!loc?.id) return { reset: false, warnings: ["Demo location is missing."] }; const results = []; for (const table of ["location_branding_settings", "location_offerings", "location_commerce_items", "location_commerce_sections", "location_commerce_pages", "location_qr_scan_events", "location_qr_codes", "location_offer_claims", "location_offers", "location_vip_signups", "location_notification_deliveries", "location_notification_events", "location_notification_recipients", "location_notification_preferences", "location_leads", "location_private_feedback", "outing_visit_verifications", "location_marketing_suggestions", "location_marketing_generations", "location_marketing_generation_usage", "location_sms_credit_ledger", "location_messaging_campaigns", "location_messaging_custom_requests", "reservations", "location_reservations", "reservation_waitlist", "location_analytics_events"]) results.push(await deleteDemoRows(table, loc.id)); if (stampLocation) await safeUpdateExistingColumns("locations", "id", loc.id, { demo_reset_at: new Date().toISOString(), is_searchable: false, demo_visible_publicly: false }); return { reset: true, warnings: results.filter((r) => r.skipped).map((r) => `${r.table}: ${r.reason}`) }; }
export function getMirrorDemoLinks(locationId: string): DemoLink[] { const pub = `/locations/hybrid/${locationId}`; return ["Public Profile", "Public Menu", "Public Offers", "Public VIP", "Public Events", "Public Feedback", "Public Check-in", "Public Review", "Public Reservation"].map((label) => ({ label, href: label === "Public Profile" ? `${pub}?demo=1` : label.includes("Reservation") ? `/reserve/location/${locationId}?demo=1` : `${pub}/${label.split(" ")[1].toLowerCase().replace("check-in", "check-in")}?demo=1` })).concat([{ label: "Admin CRM", href: `/admin/dashboard/crm/${locationId}` }, { label: "Business Dashboard", href: `/business/dashboard?locationId=${locationId}` }, { label: "Sales Demo", href: `/admin/dashboard/settings/demo-center?mode=sales&locationId=${locationId}` }, { label: "Team Training", href: "/admin/dashboard/team/demo" }]); }
export async function getTeamTrainingDemoOverview() { const [masters, sessions] = await Promise.all([countRows("crm_demo_locations"), countRows("crm_demo_sessions")]); return { status: masters === null ? "Not installed" : "Ready", masterCount: masters || 0, sessionCount: sessions || 0, href: "/admin/dashboard/team/demo" }; }
export async function getDemoCenterOverview() { const location = await getMirrorDemoLocation(); const id = location?.id; const tables = ["location_qr_codes", "location_offers", "location_vip_signups", "location_leads", "reservations", "reservation_waitlist", "location_notification_events", "location_marketing_suggestions", "location_analytics_events", "location_branding_settings"]; const counts: any = {}; for (const t of tables) counts[t] = id ? await countRows(t, id) : null; const links = id ? getMirrorDemoLinks(id) : []; const teamTraining = await getTeamTrainingDemoOverview(); const migrationReady = await hasColumn("locations", "demo_key"); const moduleStatus = (table: string): DemoStatus => counts[table] === null ? "Not installed" : counts[table] > 0 ? "Ready" : "Partial"; const growthTables = ["location_offers", "location_vip_signups", "location_leads", "location_marketing_suggestions", "location_branding_settings"]; const growthReady = growthTables.every((t) => (counts[t] || 0) > 0); const growthInstalled = growthTables.every((t) => counts[t] !== null); const emailTemplates = await countRows("email_templates"); const health = { demoMetadataMigration: migrationReady ? "Ready" : "Missing", demoLocation: id ? "Ready" : "Missing", growthProSeed: growthReady ? "Ready" : growthInstalled ? "Partial" : "Partial", reservationSeed: moduleStatus("reservations"), qrSeed: moduleStatus("location_qr_codes"), emailTest: emailTemplates === null ? "Not tested" : emailTemplates > 0 ? "Not tested" : "Missing template", notificationSeed: moduleStatus("location_notification_events"), publicSearchExposure: location?.is_searchable ? "Exposed" : "Hidden", analytics: moduleStatus("location_analytics_events"), salesDemo: id && links.some((l) => l.label === "Admin CRM") && links.some((l) => l.label === "Public Profile") ? "Ready" : "Needs setup" }; return { location, links, counts, teamTraining, lastReset: location?.demo_reset_at || null, publicSearchExposed: Boolean(location?.is_searchable), warnings: [!migrationReady && "Demo metadata migration is missing. Apply 20260627120000_unified_demo_center.sql.", !location && "Create the canonical mirror demo location to unlock links and seeded data.", location?.is_searchable && "Demo location is currently searchable; disable before public launch.", Object.values(health).includes("Partial") && "Demo refreshed with some modules skipped."].filter(Boolean) as string[], health }; }
export async function getSalesDemoView(locationId: string) { return { sections: ["Discovery profile", "Growth Pro value", "Branding", "Menu/packages", "QR kit", "VIP capture", "Offers", "Event leads", "Reservations", "Notifications", "Feedback/reviews", "Marketing Studio", "Analytics/ROI"].map((title) => ({ title, talkingPoints: [`Show how ${title.toLowerCase()} uses the same live product surfaces as a real Growth Pro location.`, "Keep demo emails and customer data safely tagged."], href: getMirrorDemoLinks(locationId).find((l) => l.label.includes("Public") || l.label.includes("Business"))?.href || "/admin/dashboard/settings/demo-center" })) }; }
export async function runDemoEmailTest(adminEmail?: string | null) { const to = "demo-owner@theouthaven.com"; if (!isSafeDemoEmail(to, adminEmail)) return { ok: false, message: "Demo email could not be sent because the recipient is not safe." }; try { return await sendTemplatedEmail({ to, templateKey: "reservation_daily_summary", input: { locationName: DEMO_LOCATION_NAME } as any, sourceType: "demo_center", sourceId: MIRROR_DEMO_KEY }); } catch (error) { const msg = errorMessage(error); if (/template|reservation_daily_summary|not found|missing|registered/i.test(msg)) return { ok: false, message: "Demo email could not be sent because no reservation demo email template is registered yet." }; return { ok: false, message: "Demo email could not be sent. Check Vercel logs for the full server error." }; } }
