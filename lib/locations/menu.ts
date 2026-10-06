import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLegacyMenuRowsFromUniversalCatalog } from "@/lib/catalog/menuAdapter";
import { UNIVERSAL_CATALOG_ITEM_TYPES } from "@/lib/catalog/types";
import type { UniversalCatalogChannel } from "@/lib/catalog/types";
import { getPublicLocationMenuHref } from "@/lib/locations/public-location-url";
import { cleanNullableUrl, isValidMenuAction, menuResponseShape, normalizeMenuStatus, normalizePriceCents } from "@/lib/locations/menuValidation";
import type { LocationMenuPayload, MenuActorContext, SaveLocationMenuInput } from "@/lib/locations/menuTypes";

export class MenuAccessError extends Error { status = 403; constructor(message = "You do not have permission to edit this menu") { super(message); } }
export class MenuValidationError extends Error { status = 400; constructor(message = "Invalid menu payload") { super(message); } }

export function normalizeMenuPayload(input: unknown): SaveLocationMenuInput {
  return input && typeof input === "object" ? (input as SaveLocationMenuInput) : {};
}

export function validateMenuPayload(method: "POST" | "PATCH" | "DELETE", input: unknown) {
  const body = normalizeMenuPayload(input);
  if (!isValidMenuAction(method, body.action)) throw new MenuValidationError("Invalid menu action");
  return body;
}

function assertCanRead(ctx: MenuActorContext) { if (ctx.permissions?.canRead === false) throw new MenuAccessError("You do not have permission to view this menu"); }
function assertCanEdit(ctx: MenuActorContext) { if (ctx.permissions?.canEdit === false) throw new MenuAccessError(); }

const CATALOG_ITEM_TYPES = new Set<string>(UNIVERSAL_CATALOG_ITEM_TYPES);
const CATALOG_CHANNELS = ["website","profile","pos","reserve","online_ordering","qr_ordering","kiosk"] as const;

function nullableInteger(value: unknown, label: string, min = 0) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) throw new MenuValidationError(`${label} must be a whole number`);
  return parsed;
}

function normalizeItemType(value: unknown) {
  const candidate = String(value || "food_beverage");
  if (!CATALOG_ITEM_TYPES.has(candidate)) throw new MenuValidationError("Invalid item type");
  return candidate;
}

function normalizeChannelVisibility(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(CATALOG_CHANNELS.map((channel) => [channel, source[channel] === true])) as Record<string, boolean>;
}

function catalogItemFields(body: SaveLocationMenuInput) {
  return {
    item_type: normalizeItemType(body.item_type),
    pos_short_name: String(body.pos_short_name || "").trim() || null,
    sku: String(body.sku || "").trim() || null,
    tax_category: String(body.tax_category || "").trim() || null,
    revenue_category: String(body.revenue_category || "").trim() || null,
    prep_station: String(body.prep_station || "").trim() || null,
    duration_minutes: nullableInteger(body.duration_minutes, "Duration", 1),
    capacity: nullableInteger(body.capacity, "Capacity", 1),
    resource_type: String(body.resource_type || "").trim() || null,
    requires_booking: body.requires_booking === true,
    requires_waiver: body.requires_waiver === true,
    minimum_age: nullableInteger(body.minimum_age, "Minimum age", 0),
    deposit_cents: nullableInteger(body.deposit_cents, "Deposit", 0),
    channel_visibility: normalizeChannelVisibility(body.channel_visibility),
    fulfillment_metadata: body.fulfillment_metadata && typeof body.fulfillment_metadata === "object" && !Array.isArray(body.fulfillment_metadata) ? body.fulfillment_metadata : {},
    booking_metadata: body.booking_metadata && typeof body.booking_metadata === "object" && !Array.isArray(body.booking_metadata) ? body.booking_metadata : {},
  };
}

export async function getLocationCommercePages(locationId: string) {
  const { data, error } = await supabaseAdmin
    .from("location_commerce_pages")
    .select("*")
    .eq("location_id", locationId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as Record<string, any>[];
}

export async function getMenuPage(locationId: string, commercePageId?: string | null) {
  if (commercePageId) {
    const { data } = await supabaseAdmin
      .from("location_commerce_pages")
      .select("*")
      .eq("location_id", locationId)
      .eq("id", commercePageId)
      .maybeSingle();
    return data as Record<string, any> | null;
  }
  const { data } = await supabaseAdmin.from("location_commerce_pages").select("*").eq("location_id", locationId).eq("page_type", "menu").order("sort_order", { ascending: true }).limit(1).maybeSingle();
  return data as Record<string, any> | null;
}

export async function ensureMenuPage(locationId: string, title = "Menu", commercePageId?: string | null) {
  const existing = await getMenuPage(locationId, commercePageId);
  if (existing) return existing;
  if (commercePageId) throw new MenuValidationError("Menu or package page not found");
  const { data, error } = await supabaseAdmin.from("location_commerce_pages").insert({ location_id: locationId, page_type: "menu", title, status: "draft", is_active: false }).select("*").single();
  if (error) throw error;
  return data as Record<string, any>;
}

async function readMenuRows(
  locationId: string,
  pageId: string,
  publicOnly = false,
  channel?: UniversalCatalogChannel,
) {
  return getLegacyMenuRowsFromUniversalCatalog(locationId, pageId, { publicOnly, channel });
}

export async function getLocationMenu(
  locationId: string,
  commercePageId?: string | null,
  channel?: UniversalCatalogChannel,
) {
  const page = await getMenuPage(locationId, commercePageId);
  const rows = page
    ? await readMenuRows(locationId, String(page.id), false, channel)
    : { sections: [], items: [] };
  return { page, ...rows };
}

export async function getEditableLocationMenu(locationId: string, actorContext: MenuActorContext, commercePageId?: string | null): Promise<LocationMenuPayload> {
  assertCanRead(actorContext);
  const menu = await getLocationMenu(locationId, commercePageId);
  return menuResponseShape({ location: actorContext.location, page: menu.page, sections: menu.sections, items: menu.items, previewUrl: getPublicLocationMenuHref(actorContext.location), permissions: { canEdit: actorContext.permissions?.canEdit !== false, canRead: true } }) as LocationMenuPayload;
}

async function findPublicMenuLocation(locationIdOrSlug: string) {
  for (const column of ["id", "source_id", "source_location_id", "slug"] as const) {
    try {
      const { data, error } = await supabaseAdmin.from("locations").select("*").eq(column, locationIdOrSlug).maybeSingle();
      if (!error && data?.id) return data as Record<string, any>;
    } catch {
      // Optional columns may not exist in every deployed database.
    }
  }
  return null;
}

export async function getPublicLocationMenu(locationIdOrSlug: string, allowDraftPreview = false, commercePageId?: string | null) {
  const location = await findPublicMenuLocation(locationIdOrSlug);
  if (!location?.id) return { location: null, page: null, sections: [], items: [] };
  let query = supabaseAdmin.from("location_commerce_pages").select("*").eq("location_id", String(location.id));
  if (commercePageId) query = query.eq("id", commercePageId);
  else query = query.eq("page_type", "menu").order("sort_order", { ascending: true }).limit(1);
  if (!allowDraftPreview) query = query.eq("status", "published").eq("is_active", true);
  const { data: page } = await query.maybeSingle();
  const rows = page
    ? await readMenuRows(
        String(location.id),
        String(page.id),
        !allowDraftPreview,
        allowDraftPreview ? undefined : "profile",
      )
    : { sections: [], items: [] };
  return { location: location as Record<string, any>, page: page as Record<string, any> | null, ...rows };
}

export async function publishLocationMenu(locationId: string, actorContext: MenuActorContext) {
  return saveLocationMenu(locationId, { action: "publish_page" }, actorContext, "PATCH");
}

export async function saveLocationMenu(locationId: string, input: SaveLocationMenuInput, actorContext: MenuActorContext, method: "POST" | "PATCH" | "DELETE" = "PATCH") {
  assertCanEdit(actorContext);
  const body = validateMenuPayload(method, input);
  const commercePageId = String(body.commercePageId || body.pageId || "").trim() || undefined;
  if (method === "POST") {
    const page = await ensureMenuPage(locationId, body.title || "Menu", commercePageId);
    if (body.action === "create_section") {
      const title = String(body.title || "").trim(); if (!title) throw new MenuValidationError("Section title required");
      const { error } = await supabaseAdmin.from("location_commerce_sections").insert({ location_id: locationId, commerce_page_id: page.id, page_id: page.id, name: title, title, description: String(body.description || "").trim() || null, sort_order: Number(body.sort_order ?? 0), is_active: body.is_active !== false }); if (error) throw error;
    } else if (body.action === "create_item") {
      const name = String(body.name || "").trim(); if (!name) throw new MenuValidationError("Item name required");
      const price = normalizePriceCents(body.price_cents); if (price === undefined) throw new MenuValidationError("Price must be a non-negative integer");
      const sectionId = String(body.section_id || body.sectionId || "");
      const { data: section } = await supabaseAdmin.from("location_commerce_sections").select("id,commerce_page_id").eq("id", sectionId).eq("location_id", locationId).maybeSingle(); if (!section || String(section.commerce_page_id) !== String(page.id)) throw new MenuValidationError("Section not found on this page");
      const { error } = await supabaseAdmin.from("location_commerce_items").insert({ location_id: locationId, commerce_page_id: page.id, page_id: page.id, section_id: sectionId, name, description: String(body.description || "").trim() || null, price_cents: price, price: body.price_label || (price != null ? `${(price / 100).toFixed(2)}` : null), price_label: String(body.price_label || "").trim() || null, image_url: cleanNullableUrl(body.image_url), tags: body.tags || [], is_available: body.is_available !== false, is_featured: body.is_featured === true, sort_order: Number(body.sort_order ?? 0), ...catalogItemFields(body) }); if (error) throw error;
    }
  } else if (method === "PATCH") {
    const page = await getMenuPage(locationId, commercePageId); if (!page) throw new MenuValidationError("Menu or package page not found");
    if (["publish_page", "unpublish_page", "update_page"].includes(String(body.action))) {
      const status = body.action === "publish_page" ? "published" : body.action === "unpublish_page" ? "draft" : normalizeMenuStatus(body.status || page.status || (page.is_active ? "published" : "draft")); if (!status) throw new MenuValidationError("Invalid menu status");
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin.from("location_commerce_pages").update({ title: String(body.title ?? page.title ?? "Menu").trim() || "Menu", description: String(body.description ?? page.description ?? "").trim() || null, external_url: cleanNullableUrl(body.external_url ?? page.external_url), pdf_url: cleanNullableUrl(body.pdf_url ?? page.pdf_url), status, is_active: status === "published", published_revision: status === "published" ? Number(page.catalog_revision || 1) : page.published_revision, published_at: status === "published" ? now : page.published_at, updated_at: now }).eq("id", page.id).eq("location_id", locationId); if (error) throw error;
    } else if (body.action === "update_section") {
      const title = String(body.title || body.name || "").trim(); if (!title) throw new MenuValidationError("Section title required");
      const { error } = await supabaseAdmin.from("location_commerce_sections").update({ title, name: title, description: String(body.description || "").trim() || null, is_active: body.is_active !== false, updated_at: new Date().toISOString() }).eq("id", body.section_id).eq("commerce_page_id", page.id).eq("location_id", locationId); if (error) throw error;
    } else if (body.action === "update_item") {
      const name = String(body.name || "").trim(); if (!name) throw new MenuValidationError("Item name required");
      const price = normalizePriceCents(body.price_cents); if (price === undefined) throw new MenuValidationError("Price must be a non-negative integer");
      const sectionId = String(body.section_id || body.sectionId || "").trim();
      if (!sectionId) throw new MenuValidationError("Section required");
      const { data: section } = await supabaseAdmin.from("location_commerce_sections").select("id,commerce_page_id").eq("id", sectionId).eq("location_id", locationId).maybeSingle();
      if (!section || String(section.commerce_page_id) !== String(page.id)) throw new MenuValidationError("Section not found on this page");
      const { error } = await supabaseAdmin.from("location_commerce_items").update({ section_id: sectionId, name, description: String(body.description || "").trim() || null, price_cents: price, price_label: String(body.price_label || "").trim() || null, price: body.price_label || (price != null ? `${(price / 100).toFixed(2)}` : null), image_url: cleanNullableUrl(body.image_url), tags: body.tags || [], is_available: body.is_available !== false, is_featured: body.is_featured === true, ...catalogItemFields(body), updated_at: new Date().toISOString() }).eq("id", body.item_id).eq("commerce_page_id", page.id).eq("location_id", locationId); if (error) throw error;
    }
    for (const [i, id] of (body.section_ids || []).entries()) await supabaseAdmin.from("location_commerce_sections").update({ sort_order: i }).eq("id", id).eq("commerce_page_id", page.id).eq("location_id", locationId);
    for (const [i, id] of (body.item_ids || []).entries()) await supabaseAdmin.from("location_commerce_items").update({ sort_order: i }).eq("id", id).eq("commerce_page_id", page.id).eq("location_id", locationId);
  } else {
    const page = await getMenuPage(locationId, commercePageId); if (!page) throw new MenuValidationError("Menu or package page not found");
    if (body.action === "delete_item") await supabaseAdmin.from("location_commerce_items").delete().eq("id", body.item_id).eq("commerce_page_id", page.id).eq("location_id", locationId);
    else { await supabaseAdmin.from("location_commerce_items").delete().eq("section_id", body.section_id).eq("commerce_page_id", page.id).eq("location_id", locationId); await supabaseAdmin.from("location_commerce_sections").delete().eq("id", body.section_id).eq("commerce_page_id", page.id).eq("location_id", locationId); }
  }
  return getEditableLocationMenu(locationId, actorContext, commercePageId);
}
