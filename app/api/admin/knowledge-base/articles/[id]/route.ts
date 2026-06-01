import { NextRequest } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { roleCanManageKb, normalizeKbRole } from "@/lib/knowledge-base/access";
import { filterArticleForRole, KB_SELECT, sanitizeKbPayload } from "@/lib/knowledge-base/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const { error, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  if (error) return error;
  const { id } = await params;
  const { data, error: loadError } = await supabaseAdmin.from("knowledge_base_articles").select(KB_SELECT).eq("id", id).single();
  if (loadError || !data) return Response.json({ success: false, error: "Not found" }, { status: 404 });
  if (!filterArticleForRole(data, adminUser.role, adminUser.user_id, true)) return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  return Response.json({ success: true, article: data });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const { error, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  if (error) return error;
  const { id } = await params;
  const { data: current } = await supabaseAdmin.from("knowledge_base_articles").select("*").eq("id", id).single();
  if (!current) return Response.json({ success: false, error: "Not found" }, { status: 404 });
  const manager = roleCanManageKb(adminUser.role);
  if (!manager && !(normalizeKbRole(adminUser.role) === "editor" && current.created_by === adminUser.user_id && current.status === "draft")) {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  await supabaseAdmin.from("knowledge_base_article_versions").insert({
    article_id: current.id,
    title: current.title,
    excerpt: current.excerpt,
    content: current.content,
    status: current.status,
    visibility: current.visibility,
    allowed_roles: current.allowed_roles,
    tags: current.tags,
    saved_by: adminUser.user_id,
  });
  const body = await request.json();
  const update = { ...sanitizeKbPayload(body, adminUser.role), updated_by: adminUser.user_id };
  const { data, error: updateError } = await supabaseAdmin.from("knowledge_base_articles").update(update).eq("id", id).select("*").single();
  if (updateError) return Response.json({ success: false, error: updateError.message }, { status: 400 });
  return Response.json({ success: true, article: data });
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const { error, adminUser } = await requireAdminApiRole(["superadmin", "admin"]);
  if (error) return error;
  const { id } = await params;
  const hard = request.nextUrl.searchParams.get("hard") === "true";
  if (hard && adminUser.role !== "superadmin") return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  const result = hard
    ? await supabaseAdmin.from("knowledge_base_articles").delete().eq("id", id)
    : await supabaseAdmin.from("knowledge_base_articles").update({ status: "archived", updated_by: adminUser.user_id }).eq("id", id);
  if (result.error) return Response.json({ success: false, error: result.error.message }, { status: 400 });
  return Response.json({ success: true });
}
