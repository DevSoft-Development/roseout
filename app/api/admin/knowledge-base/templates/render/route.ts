import { NextRequest } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { renderKbTemplate } from "@/lib/knowledge-base/render";
import { filterArticleForRole } from "@/lib/knowledge-base/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const { error, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  if (error) return error;
  const body = await request.json();
  const { data: article } = await supabaseAdmin.from("knowledge_base_articles").select("*").eq("id", body.article_id).single();
  if (!article) return Response.json({ success: false, error: "Template not found" }, { status: 404 });
  if (!filterArticleForRole(article, adminUser.role, adminUser.user_id, true)) return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  return Response.json({ success: true, content: renderKbTemplate(article.content, body.variables ?? {}) });
}
