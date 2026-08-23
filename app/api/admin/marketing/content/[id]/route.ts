import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  cancelPendingApprovalForEdit,
  isMeaningfulContentPatch,
  loadMarketingContent,
  normalizePlatforms,
  type MarketingContentRow,
} from "@/lib/marketing/content-operations";
import type { TaskActor } from "@/lib/crm/tasks/types";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textOrNull(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function textArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

const writable = new Set([
  "title",
  "scope",
  "campaign_id",
  "location_id",
  "organization_id",
  "source_type",
  "source_id",
  "content_type",
  "occasion",
  "market",
  "neighborhood",
  "budget_category",
  "owner_user_id",
  "priority",
  "due_at",
  "publish_at",
  "selected_platforms",
  "media_urls",
  "caption",
  "platform_copy",
  "auto_publish",
  "hook",
  "script",
  "voiceover",
  "cta",
  "metadata",
]);

function buildPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!writable.has(key)) continue;
    if (key === "selected_platforms") patch[key] = normalizePlatforms(value);
    else if (key === "media_urls") patch[key] = textArray(value);
    else if (key === "auto_publish") patch[key] = Boolean(value);
    else if (key === "platform_copy" || key === "metadata") {
      patch[key] = value && typeof value === "object" ? value : {};
    } else if (["title", "scope", "content_type", "priority"].includes(key)) patch[key] = text(value);
    else patch[key] = textOrNull(value);
  }
  return patch;
}

function actorFromAuth(auth: Awaited<ReturnType<typeof requireAdminApiRole>>): TaskActor {
  if (!auth.adminUser) throw new Error("Admin user missing.");
  return {
    user_id: auth.adminUser.user_id,
    email: auth.adminUser.email || null,
    role: auth.adminUser.role,
  };
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketing);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    const item = await loadMarketingContent(id);
    const [{ data: posts }, { data: approvals }, { data: assets }] = await Promise.all([
      supabaseAdmin.from("social_posts").select("*").eq("content_item_id", id).order("platform"),
      supabaseAdmin.from("marketing_approvals").select("*").eq("content_item_id", id).order("created_at", { ascending: false }),
      supabaseAdmin.from("marketing_content_asset_links").select("sort_order,marketing_assets(*)").eq("content_item_id", id).order("sort_order"),
    ]);
    return NextResponse.json({ success: true, item, posts: posts || [], approvals: approvals || [], assets: assets || [] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Not found." }, { status: 404 });
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingEdit);
  if (auth.error) return auth.error;

  try {
    const { id } = await context.params;
    const before = await loadMarketingContent(id);
    const body = await req.json();
    const patch = buildPatch(body as Record<string, unknown>);
    if (!Object.keys(patch).length) {
      return NextResponse.json({ success: false, error: "No editable fields supplied." }, { status: 400 });
    }

    const meaningful = isMeaningfulContentPatch(patch);
    const actor = actorFromAuth(auth);
    const next: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };

    if (meaningful && ["pending", "approved"].includes(before.approval_status)) {
      if (before.approval_status === "pending") await cancelPendingApprovalForEdit(before, actor);
      next.current_version = Number(before.current_version || 1) + 1;
      next.approval_status = "not_submitted";
      next.status = "draft";
      next.approved_by = null;
      next.approved_at = null;
      next.approved_version = null;
      next.approval_hash = null;

      await supabaseAdmin
        .from("social_publish_jobs")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .in("social_post_id", (
          await supabaseAdmin.from("social_posts").select("id").eq("content_item_id", id)
        ).data?.map((row) => row.id) || [])
        .in("status", ["queued", "retrying"]);

      await supabaseAdmin
        .from("social_posts")
        .update({ status: "draft", error_message: null, updated_at: new Date().toISOString() })
        .eq("content_item_id", id)
        .in("status", ["scheduled", "failed"]);
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_content_items")
      .update(next)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw error || new Error("Could not save content.");

    if (data.location_id) {
      await supabaseAdmin.from("marketing_content_locations").upsert(
        { content_item_id: data.id, location_id: data.location_id, role: "featured" },
        { onConflict: "content_item_id,location_id,role" },
      );
    }

    return NextResponse.json({ success: true, item: data as MarketingContentRow, reapproval_required: meaningful && ["pending", "approved"].includes(before.approval_status) });
  } catch (error) {
    console.error("Marketing content update failed", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not save content." }, { status: 500 });
  }
}
