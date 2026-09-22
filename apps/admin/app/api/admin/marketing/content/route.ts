import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { normalizePlatforms } from "@/lib/marketing/content-operations";

export const dynamic = "force-dynamic";

const CONTENT_ITEM_FIELDS = "id,scope,campaign_id,location_id,organization_id,source_type,source_id,title,content_type,occasion,market,neighborhood,budget_category,owner_user_id,status,priority,due_at,publish_at,approval_status,approved_by,approved_at,approved_version,current_version,selected_platforms,media_urls,caption,platform_copy,auto_publish,hook,script,voiceover,cta,created_at,updated_at,last_submitted_at";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textOrNull(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function textArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export async function GET(req: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketing);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const status = text(url.searchParams.get("status"));
  const owner = text(url.searchParams.get("owner"));
  let query = supabaseAdmin
    .from("marketing_content_items")
    .select(CONTENT_ITEM_FIELDS)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(250);
  if (status) query = query.eq("status", status);
  if (owner) query = query.eq("owner_user_id", owner);

  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, items: data || [] });
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingEdit);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const title = text(body.title);
    if (!title) return NextResponse.json({ success: false, error: "Title is required." }, { status: 400 });

    const mediaUrls = textArray(body.media_urls);
    const { data, error } = await supabaseAdmin
      .from("marketing_content_items")
      .insert({
        scope: text(body.scope) || "platform",
        campaign_id: textOrNull(body.campaign_id),
        location_id: textOrNull(body.location_id),
        organization_id: textOrNull(body.organization_id),
        source_type: textOrNull(body.source_type),
        source_id: textOrNull(body.source_id),
        title,
        content_type: text(body.content_type) || "social_post",
        occasion: textOrNull(body.occasion),
        market: textOrNull(body.market),
        neighborhood: textOrNull(body.neighborhood),
        budget_category: textOrNull(body.budget_category),
        owner_user_id: textOrNull(body.owner_user_id) || auth.adminUser?.user_id || null,
        status: "draft",
        priority: text(body.priority) || "normal",
        due_at: textOrNull(body.due_at),
        publish_at: textOrNull(body.publish_at),
        selected_platforms: normalizePlatforms(body.selected_platforms),
        media_urls: mediaUrls,
        caption: textOrNull(body.caption),
        platform_copy: body.platform_copy && typeof body.platform_copy === "object" ? body.platform_copy : {},
        auto_publish: Boolean(body.auto_publish),
        hook: textOrNull(body.hook),
        script: textOrNull(body.script),
        voiceover: textOrNull(body.voiceover),
        cta: textOrNull(body.cta),
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
        created_by: auth.adminUser?.user_id || null,
      })
      .select(CONTENT_ITEM_FIELDS)
      .single();

    if (error || !data) throw error || new Error("Could not create content item.");

    if (data.location_id) {
      await supabaseAdmin.from("marketing_content_locations").upsert(
        { content_item_id: data.id, location_id: data.location_id, role: "featured" },
        { onConflict: "content_item_id,location_id,role" },
      );
    }

    return NextResponse.json({ success: true, item: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not create Marketing content." },
      { status: 500 },
    );
  }
}
