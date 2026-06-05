import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const REVIEW_STATUSES = new Set(["new", "reviewing", "fixed", "ignored", "archived"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("search_health_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("ADMIN_SEARCH_HEALTH_DETAIL_ERROR", error);
    return NextResponse.json({ success: false, error: "Failed to load search health event" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, row: data, debug: data.debug ?? {} });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    if (typeof body.review_status === "string") {
      if (!REVIEW_STATUSES.has(body.review_status)) {
        return NextResponse.json({ success: false, error: "Invalid review_status" }, { status: 400 });
      }
      updates.review_status = body.review_status;
      updates.reviewed_by = auth.adminUser?.user_id ?? null;
      updates.reviewed_at = new Date().toISOString();
    }

    if (typeof body.review_notes === "string") {
      updates.review_notes = body.review_notes.slice(0, 5000);
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ success: false, error: "No allowed updates" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("search_health_events")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, row: data, debug: data.debug ?? {} });
  } catch (error) {
    console.error("ADMIN_SEARCH_HEALTH_PATCH_ERROR", error);
    return NextResponse.json({ success: false, error: "Failed to update search health event" }, { status: 500 });
  }
}
