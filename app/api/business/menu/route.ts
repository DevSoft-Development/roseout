import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireLocationPermission } from "@/lib/location-access";
import { getPublicLocationMenuHref } from "@/lib/locations/public-location-url";
import { cleanNullableUrl, isValidMenuAction, menuResponseShape, normalizeMenuStatus, normalizePriceCents } from "@/lib/business/menu-validation";

export const dynamic = "force-dynamic";

async function resolve(req: Request, body?: any) {
  const url = new URL(req.url);
  const pick = (key: string) => body?.[key] ?? url.searchParams.get(key);
  const permission = req.method === "GET" ? "menu.view" : "menu.edit";
  const { context: ctx, error } = await requireLocationPermission({
    request: req,
    body,
    locationId: pick("locationId") as string | null,
    adminLocationId: pick("adminLocationId") as string | null,
    demoLocationId: pick("demoLocationId") as string | null,
    sourceId: pick("sourceId") as string | null,
    type: pick("type") as string | null,
    requiredPermission: permission,
    allowDemoPreview: true,
  });
  if (error) return { error };
  return { locationId: ctx.locationId, location: ctx.location as any, access: ctx };
}

async function getPage(locationId: string) {
  const { data } = await supabaseAdmin.from("location_commerce_pages").select("*").eq("location_id", locationId).eq("page_type", "menu").order("sort_order", { ascending: true }).limit(1).maybeSingle();
  return data;
}
async function ensurePage(locationId: string, title = "Menu") {
  const existing = await getPage(locationId);
  if (existing) return existing;
  const { data, error } = await supabaseAdmin.from("location_commerce_pages").insert({ location_id: locationId, page_type: "menu", title, status: "draft", is_active: false }).select("*").single();
  if (error) throw error;
  return data;
}
async function payload(location: any) {
  const locationId = String(location.id);
  const page = await getPage(locationId);
  const pageId = page?.id || "__none__";
  const [{ data: sections }, { data: items }] = await Promise.all([
    supabaseAdmin.from("location_commerce_sections").select("*").eq("location_id", locationId).eq("commerce_page_id", pageId).order("sort_order", { ascending: true }),
    supabaseAdmin.from("location_commerce_items").select("*").eq("location_id", locationId).eq("commerce_page_id", pageId).order("sort_order", { ascending: true }),
  ]);
  return menuResponseShape({ location, page, sections: sections || [], items: items || [], previewUrl: getPublicLocationMenuHref(location), permissions: { canEdit: true } });
}

export async function GET(req: Request) {
  const ctx = await resolve(req);
  if (ctx.error) return ctx.error;
  return NextResponse.json(await payload(ctx.location));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!isValidMenuAction("POST", body.action)) return NextResponse.json({ ok: false, message: "Invalid menu action" }, { status: 400 });
  const ctx = await resolve(req, body); if (ctx.error) return ctx.error;
  try {
    const page = await ensurePage(ctx.locationId, body.title || "Menu");
    if (body.action === "create_section") {
      const title = String(body.title || "").trim(); if (!title) return NextResponse.json({ ok: false, message: "Section title required" }, { status: 400 });
      const { error } = await supabaseAdmin.from("location_commerce_sections").insert({ location_id: ctx.locationId, commerce_page_id: page.id, page_id: page.id, name: title, title, description: String(body.description || "").trim() || null, sort_order: Number(body.sort_order ?? 0), is_active: body.is_active !== false }); if (error) throw error;
    }
    if (body.action === "create_item") {
      const name = String(body.name || "").trim(); if (!name) return NextResponse.json({ ok: false, message: "Item name required" }, { status: 400 });
      const price = normalizePriceCents(body.price_cents); if (price === undefined) return NextResponse.json({ ok: false, message: "Price must be a non-negative integer" }, { status: 400 });
      const sectionId = String(body.section_id || body.sectionId || "");
      const { data: section } = await supabaseAdmin.from("location_commerce_sections").select("id").eq("id", sectionId).eq("location_id", ctx.locationId).maybeSingle(); if (!section) return NextResponse.json({ ok: false, message: "Section not found" }, { status: 404 });
      const { error } = await supabaseAdmin.from("location_commerce_items").insert({ location_id: ctx.locationId, commerce_page_id: page.id, page_id: page.id, section_id: sectionId, name, description: String(body.description || "").trim() || null, price_cents: price, price: body.price_label || (price != null ? `$${(price/100).toFixed(2)}` : null), price_label: String(body.price_label || "").trim() || null, image_url: cleanNullableUrl(body.image_url), tags: body.tags || [], is_available: body.is_available !== false, is_featured: body.is_featured === true, sort_order: Number(body.sort_order ?? 0) }); if (error) throw error;
    }
    return NextResponse.json(await payload(ctx.location));
  } catch { return NextResponse.json({ ok: false, message: "We could not save the menu right now" }, { status: 500 }); }
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!isValidMenuAction("PATCH", body.action)) return NextResponse.json({ ok: false, message: "Invalid menu action" }, { status: 400 });
  const ctx = await resolve(req, body); if (ctx.error) return ctx.error;
  const page = await getPage(ctx.locationId); if (!page) return NextResponse.json({ ok: false, message: "Menu page not found" }, { status: 404 });
  try {
    if (["publish_page", "unpublish_page", "update_page"].includes(body.action)) {
      const status = body.action === "publish_page" ? "published" : body.action === "unpublish_page" ? "draft" : normalizeMenuStatus(body.status || page.status || (page.is_active ? "published" : "draft"));
      if (!status) return NextResponse.json({ ok: false, message: "Invalid menu status" }, { status: 400 });
      const { error } = await supabaseAdmin.from("location_commerce_pages").update({ title: String(body.title ?? page.title ?? "Menu").trim() || "Menu", description: String(body.description ?? page.description ?? "").trim() || null, external_url: cleanNullableUrl(body.external_url ?? page.external_url), pdf_url: cleanNullableUrl(body.pdf_url ?? page.pdf_url), status, is_active: status === "published", updated_at: new Date().toISOString() }).eq("id", page.id).eq("location_id", ctx.locationId); if (error) throw error;
    }
    if (body.action === "update_section") { const title = String(body.title || body.name || "").trim(); if (!title) return NextResponse.json({ ok: false, message: "Section title required" }, { status: 400 }); const { error } = await supabaseAdmin.from("location_commerce_sections").update({ title, name: title, description: String(body.description || "").trim() || null, is_active: body.is_active !== false, updated_at: new Date().toISOString() }).eq("id", body.section_id).eq("location_id", ctx.locationId); if (error) throw error; }
    if (body.action === "update_item") { const price = normalizePriceCents(body.price_cents); if (price === undefined) return NextResponse.json({ ok: false, message: "Price must be a non-negative integer" }, { status: 400 }); const { error } = await supabaseAdmin.from("location_commerce_items").update({ name: String(body.name || "").trim(), description: String(body.description || "").trim() || null, price_cents: price, price_label: String(body.price_label || "").trim() || null, price: body.price_label || (price != null ? `$${(price/100).toFixed(2)}` : null), image_url: cleanNullableUrl(body.image_url), tags: body.tags || [], is_available: body.is_available !== false, is_featured: body.is_featured === true, updated_at: new Date().toISOString() }).eq("id", body.item_id).eq("location_id", ctx.locationId); if (error) throw error; }
    for (const [i, id] of (body.section_ids || []).entries()) await supabaseAdmin.from("location_commerce_sections").update({ sort_order: i }).eq("id", id).eq("location_id", ctx.locationId);
    for (const [i, id] of (body.item_ids || []).entries()) await supabaseAdmin.from("location_commerce_items").update({ sort_order: i }).eq("id", id).eq("location_id", ctx.locationId);
    return NextResponse.json(await payload(ctx.location));
  } catch { return NextResponse.json({ ok: false, message: "We could not save the menu right now" }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!isValidMenuAction("DELETE", body.action)) return NextResponse.json({ ok: false, message: "Invalid menu action" }, { status: 400 });
  const ctx = await resolve(req, body); if (ctx.error) return ctx.error;
  try { if (body.action === "delete_item") await supabaseAdmin.from("location_commerce_items").delete().eq("id", body.item_id).eq("location_id", ctx.locationId); else { await supabaseAdmin.from("location_commerce_items").delete().eq("section_id", body.section_id).eq("location_id", ctx.locationId); await supabaseAdmin.from("location_commerce_sections").delete().eq("id", body.section_id).eq("location_id", ctx.locationId); } return NextResponse.json(await payload(ctx.location)); } catch { return NextResponse.json({ ok: false, message: "We could not save the menu right now" }, { status: 500 }); }
}
