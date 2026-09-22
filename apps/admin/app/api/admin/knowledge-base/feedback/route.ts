import { NextRequest } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const { adminUser, error: authError } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  if (authError) return authError;

  const body = await request.json();
  const rating = body.rating === "not_helpful" ? "not_helpful" : "helpful";
  const articleId = String(body.article_id || "");
  if (!articleId) return Response.json({ success: false, error: "article_id is required" }, { status: 400 });
  const { error } = await supabaseAdmin.from("knowledge_base_feedback").insert({ article_id: articleId, user_id: adminUser?.user_id ?? null, rating, note: body.note || null });
  if (error) return Response.json({ success: false, error: error.message }, { status: 400 });
  const column = rating === "helpful" ? "helpful_count" : "not_helpful_count";
  const { data } = await supabaseAdmin.from("knowledge_base_articles").select(column).eq("id", articleId).single();
  const row = data as Record<string, number> | null;
  const current = typeof row?.[column] === "number" ? row[column] : 0;
  await supabaseAdmin.from("knowledge_base_articles").update({ [column]: current + 1 }).eq("id", articleId);
  return Response.json({ success: true });
}
