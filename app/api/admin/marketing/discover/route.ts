import { NextResponse } from "next/server";
import { requireMarketingAdminApi, requireMarketingViewerApi, normalizeString, normalizeStringOrNull } from "@/lib/marketing-admin";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error: authError } = await requireMarketingViewerApi();
  if (authError) return authError;

  const [{ data: sections, error: sectionError }, { data: items, error: itemError }] = await Promise.all([
    supabaseAdmin.from("discover_sections").select("*").order("sort_order", { ascending: true }),
    supabaseAdmin.from("discover_items").select("*").order("section_id").order("sort_order", { ascending: true }),
  ]);

  if (sectionError || itemError) {
    return NextResponse.json({ error: sectionError?.message || itemError?.message || "Failed to load Discover content" }, { status: 500 });
  }

  return NextResponse.json({ sections: sections || [], items: items || [] });
}

export async function POST(req: Request) {
  const { error: authError } = await requireMarketingAdminApi();
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "section" ? "section" : "item";

  if (kind === "section") {
    const id = normalizeString(body.id).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
    const title = normalizeString(body.title);
    if (!id || !title) return NextResponse.json({ error: "Section id and title are required" }, { status: 400 });

    const { data, error } = await supabaseAdmin.from("discover_sections").insert({
      id,
      eyebrow: normalizeStringOrNull(body.eyebrow),
      title,
      description: normalizeStringOrNull(body.description),
      enabled: body.enabled !== false,
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
      updated_at: new Date().toISOString(),
    }).select("*").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ section: data }, { status: 201 });
  }

  const title = normalizeString(body.title);
  const sectionId = normalizeString(body.section_id);
  if (!title || !sectionId) return NextResponse.json({ error: "Section and title are required" }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("discover_items").insert({
    section_id: sectionId,
    title,
    subtitle: normalizeStringOrNull(body.subtitle),
    image_url: normalizeStringOrNull(body.image_url),
    href: normalizeStringOrNull(body.href),
    query: normalizeStringOrNull(body.query),
    badge: normalizeStringOrNull(body.badge),
    location_id: normalizeStringOrNull(body.location_id),
    sponsored: body.sponsored === true,
    sponsor_label: normalizeStringOrNull(body.sponsor_label),
    enabled: body.enabled !== false,
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    starts_at: normalizeStringOrNull(body.starts_at),
    ends_at: normalizeStringOrNull(body.ends_at),
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    updated_at: new Date().toISOString(),
  }).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}

export async function PATCH(req: Request) {
  const { error: authError } = await requireMarketingAdminApi();
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "section" ? "section" : "item";
  const id = normalizeString(body.id);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  if (kind === "section") {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of ["title", "eyebrow", "description"] as const) if (key in body) updates[key] = normalizeStringOrNull(body[key]);
    if ("enabled" in body) updates.enabled = body.enabled === true;
    if ("sort_order" in body) updates.sort_order = Number(body.sort_order) || 0;
    const { data, error } = await supabaseAdmin.from("discover_sections").update(updates).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ section: data });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["section_id", "title", "subtitle", "image_url", "href", "query", "badge", "location_id", "sponsor_label", "starts_at", "ends_at"] as const) {
    if (key in body) updates[key] = normalizeStringOrNull(body[key]);
  }
  if ("sponsored" in body) updates.sponsored = body.sponsored === true;
  if ("enabled" in body) updates.enabled = body.enabled === true;
  if ("sort_order" in body) updates.sort_order = Number(body.sort_order) || 0;
  if ("metadata" in body) updates.metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

  const { data, error } = await supabaseAdmin.from("discover_items").update(updates).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: Request) {
  const { error: authError } = await requireMarketingAdminApi();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") === "section" ? "section" : "item";
  const id = normalizeString(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const table = kind === "section" ? "discover_sections" : "discover_items";
  const { error } = await supabaseAdmin.from(table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
