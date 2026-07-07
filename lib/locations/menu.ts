import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
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

export async function getMenuPage(locationId: string) {
  const { data } = await supabaseAdmin.from("location_commerce_pages").select("*").eq("location_id", locationId).eq("page_type", "menu").order("sort_order", { ascending: true }).limit(1).maybeSingle();
  return data as Record<string, any> | null;
}

export async function ensureMenuPage(locationId: string, title = "Menu") {
  const existing = await getMenuPage(locationId);
  if (existing) return existing;
  const { data, error } = await supabaseAdmin.from("location_commerce_pages").insert({ location_id: locationId, page_type: "menu", title, status: "draft", is_active: false }).select("*").single();
  if (error) throw error;
  return data as Record<string, any>;
}

async function readMenuRows(locationId: string, pageId: string, publicOnly = false) {
  const sectionsQuery = supabaseAdmin.from("location_commerce_sections").select("*").eq("location_id", locationId).eq("commerce_page_id", pageId).order("sort_order", { ascending: true });
  const itemsQuery = supabaseAdmin.from("location_commerce_items").select("*").eq("location_id", locationId).eq("commerce_page_id", pageId).order("sort_order", { ascending: true });
  if (publicOnly) sectionsQuery.eq("is_active", true);
  const [{ data: sections }, { data: items }] = await Promise.all([sectionsQuery, itemsQuery]);
  return { sections: (sections || []) as Record<string, any>[], items: (items || []) as Record<string, any>[] };
}

export async function getLocationMenu(locationId: string) {
  const page = await getMenuPage(locationId);
  const rows = page ? await readMenuRows(locationId, String(page.id)) : { sections: [], items: [] };
  return { page, ...rows };
}

export async function getEditableLocationMenu(locationId: string, actorContext: MenuActorContext): Promise<LocationMenuPayload> {
  assertCanRead(actorContext);
  const menu = await getLocationMenu(locationId);
  return menuResponseShape({ location: actorContext.location, page: menu.page, sections: menu.sections, items: menu.items, previewUrl: getPublicLocationMenuHref(actorContext.location), permissions: { canEdit: actorContext.permissions?.canEdit !== false, canRead: true } }) as LocationMenuPayload;
}

async function findPublicMenuLocation(locationIdOrSlug: string) {
  for (const column of ["id", "source_id", "source_location_id", "slug"] as const) {
    try {
      const { data, error } = await supabaseAdmin
        .from("locations")
        .select("*")
        .eq(column, locationIdOrSlug)
        .maybeSingle();
      if (!error && data?.id) return data as Record<string, any>;
    } catch {
      // Optional columns such as source_location_id or slug may not exist in every
      // deployed database. Keep probing supported columns instead of failing preview.
    }
  }
  return null;
}

export async function getPublicLocationMenu(locationIdOrSlug: string, allowDraftPreview = false) {
  const location = await findPublicMenuLocation(locationIdOrSlug);
  if (!location?.id) return { location: null, page: null, sections: [], items: [] };
  let query = supabaseAdmin.from("location_commerce_pages").select("*").eq("location_id", String(location.id)).eq("page_type", "menu").order("sort_order", { ascending: true }).limit(1);
  if (!allowDraftPreview) query = query.eq("status", "published").eq("is_active", true);
  const { data: page } = await query.maybeSingle();
  const rows = page ? await readMenuRows(String(location.id), String(page.id), !allowDraftPreview) : { sections: [], items: [] };
  return { location: location as Record<string, any>, page: page as Record<string, any> | null, ...rows };
}

export async function publishLocationMenu(locationId: string, actorContext: MenuActorContext) {
  return saveLocationMenu(locationId, { action: "publish_page" }, actorContext, "PATCH");
}

export async function saveLocationMenu(locationId: string, input: SaveLocationMenuInput, actorContext: MenuActorContext, method: "POST" | "PATCH" | "DELETE" = "PATCH") {
  assertCanEdit(actorContext);
  const body = validateMenuPayload(method, input);
  if (method === "POST") {
    const page = await ensureMenuPage(locationId, body.title || "Menu");
    if (body.action === "create_section") {
      const title = String(body.title || "").trim(); if (!title) throw new MenuValidationError("Section title required");
      const { error } = await supabaseAdmin.from("location_commerce_sections").insert({ location_id: locationId, commerce_page_id: page.id, page_id: page.id, name: title, title, description: String(body.description || "").trim() || null, sort_order: Number(body.sort_order ?? 0), is_active: body.is_active !== false }); if (error) throw error;
    } else if (body.action === "create_item") {
      const name = String(body.name || "").trim(); if (!name) throw new MenuValidationError("Item name required");
      const price = normalizePriceCents(body.price_cents); if (price === undefined) throw new MenuValidationError("Price must be a non-negative integer");
      const sectionId = String(body.section_id || body.sectionId || "");
      const { data: section } = await supabaseAdmin.from("location_commerce_sections").select("id").eq("id", sectionId).eq("location_id", locationId).maybeSingle(); if (!section) throw new MenuValidationError("Section not found");
      const { error } = await supabaseAdmin.from("location_commerce_items").insert({ location_id: locationId, commerce_page_id: page.id, page_id: page.id, section_id: sectionId, name, description: String(body.description || "").trim() || null, price_cents: price, price: body.price_label || (price != null ? `$${(price / 100).toFixed(2)}` : null), price_label: String(body.price_label || "").trim() || null, image_url: cleanNullableUrl(body.image_url), tags: body.tags || [], is_available: body.is_available !== false, is_featured: body.is_featured === true, sort_order: Number(body.sort_order ?? 0) }); if (error) throw error;
    }
  } else if (method === "PATCH") {
    const page = await getMenuPage(locationId); if (!page) throw new MenuValidationError("Menu page not found");
    if (["publish_page", "unpublish_page", "update_page"].includes(String(body.action))) {
      const status = body.action === "publish_page" ? "published" : body.action === "unpublish_page" ? "draft" : normalizeMenuStatus(body.status || page.status || (page.is_active ? "published" : "draft")); if (!status) throw new MenuValidationError("Invalid menu status");
      const { error } = await supabaseAdmin.from("location_commerce_pages").update({ title: String(body.title ?? page.title ?? "Menu").trim() || "Menu", description: String(body.description ?? page.description ?? "").trim() || null, external_url: cleanNullableUrl(body.external_url ?? page.external_url), pdf_url: cleanNullableUrl(body.pdf_url ?? page.pdf_url), status, is_active: status === "published", updated_at: new Date().toISOString() }).eq("id", page.id).eq("location_id", locationId); if (error) throw error;
    } else if (body.action === "update_section") { const title = String(body.title || body.name || "").trim(); if (!title) throw new MenuValidationError("Section title required"); const { error } = await supabaseAdmin.from("location_commerce_sections").update({ title, name: title, description: String(body.description || "").trim() || null, is_active: body.is_active !== false, updated_at: new Date().toISOString() }).eq("id", body.section_id).eq("location_id", locationId); if (error) throw error;
    } else if (body.action === "update_item") { const price = normalizePriceCents(body.price_cents); if (price === undefined) throw new MenuValidationError("Price must be a non-negative integer"); const { error } = await supabaseAdmin.from("location_commerce_items").update({ name: String(body.name || "").trim(), description: String(body.description || "").trim() || null, price_cents: price, price_label: String(body.price_label || "").trim() || null, price: body.price_label || (price != null ? `$${(price / 100).toFixed(2)}` : null), image_url: cleanNullableUrl(body.image_url), tags: body.tags || [], is_available: body.is_available !== false, is_featured: body.is_featured === true, updated_at: new Date().toISOString() }).eq("id", body.item_id).eq("location_id", locationId); if (error) throw error; }
    for (const [i, id] of (body.section_ids || []).entries()) await supabaseAdmin.from("location_commerce_sections").update({ sort_order: i }).eq("id", id).eq("location_id", locationId);
    for (const [i, id] of (body.item_ids || []).entries()) await supabaseAdmin.from("location_commerce_items").update({ sort_order: i }).eq("id", id).eq("location_id", locationId);
  } else {
    if (body.action === "delete_item") await supabaseAdmin.from("location_commerce_items").delete().eq("id", body.item_id).eq("location_id", locationId);
    else { await supabaseAdmin.from("location_commerce_items").delete().eq("section_id", body.section_id).eq("location_id", locationId); await supabaseAdmin.from("location_commerce_sections").delete().eq("id", body.section_id).eq("location_id", locationId); }
  }
  return getEditableLocationMenu(locationId, actorContext);
}
