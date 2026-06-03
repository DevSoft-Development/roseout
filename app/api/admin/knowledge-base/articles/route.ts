import { NextRequest } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { roleCanEditKb } from "@/lib/knowledge-base/access";
import { listKbArticles, sanitizeKbPayload } from "@/lib/knowledge-base/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const { error, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  if (error) return error;
  const searchParams = request.nextUrl.searchParams;
  try {
    const result = await listKbArticles(adminUser.role, adminUser.user_id, {
      q: searchParams.get("q"),
      category: searchParams.get("category"),
      type: searchParams.get("type"),
      template: searchParams.get("template"),
      status: searchParams.get("status"),
      visibility: searchParams.get("visibility"),
      page: Number(searchParams.get("page") || 1),
      pageSize: Number(searchParams.get("pageSize") || 20),
    });
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json({ success: false, error: err instanceof Error ? err.message : "Unable to load articles" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  if (error) return error;
  if (!roleCanEditKb(adminUser.role)) return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const payload = { ...sanitizeKbPayload(body, adminUser.role), created_by: adminUser.user_id, updated_by: adminUser.user_id };
  const { data, error: insertError } = await supabaseAdmin.from("knowledge_base_articles").insert(payload).select("*").single();
  if (insertError) return Response.json({ success: false, error: insertError.message }, { status: 400 });
  return Response.json({ success: true, article: data }, { status: 201 });
}
