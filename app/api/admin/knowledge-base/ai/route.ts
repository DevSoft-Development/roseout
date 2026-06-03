import { NextRequest } from "next/server";
import OpenAI from "openai";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { roleCanUseKbAi } from "@/lib/knowledge-base/access";
import { filterArticleForRole } from "@/lib/knowledge-base/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { KnowledgeBaseArticle } from "@/lib/knowledge-base/types";

function fallbackAnswer(question: string, articles: KnowledgeBaseArticle[]) {
  if (articles.length === 0) return "I could not find that in the approved knowledge base.";
  const sourceList = articles.slice(0, 3).map((article) => `• ${article.title}: ${article.excerpt || article.content.slice(0, 220)}`).join("\n");
  return `I found approved knowledge base articles related to “${question}”. Review these sources:\n${sourceList}`;
}

export async function POST(request: NextRequest) {
  const { error, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  if (error) return error;
  if (!roleCanUseKbAi(adminUser.role)) return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const question = String(body.question || "").trim();
  if (question.length < 3) return Response.json({ success: false, error: "Question is required" }, { status: 400 });
  const safe = question.replace(/[%_,]/g, "").slice(0, 160);
  const { data } = await supabaseAdmin
    .from("knowledge_base_articles")
    .select("*, knowledge_base_categories(id,name,slug)")
    .eq("status", "published")
    .in("visibility", ["internal", "both"])
    .eq("ai_approved", true)
    .or(`title.ilike.%${safe}%,excerpt.ilike.%${safe}%,content.ilike.%${safe}%`)
    .limit(6);
  const articles = ((data ?? []) as KnowledgeBaseArticle[]).filter((article) => filterArticleForRole(article, adminUser.role, adminUser.user_id, false));
  let answer = fallbackAnswer(question, articles);
  let status: "answered" | "no_answer" | "error" = articles.length ? "answered" : "no_answer";
  if (process.env.OPENAI_API_KEY && articles.length) {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const context = articles.map((article, index) => `SOURCE ${index + 1}: ${article.title}\n${article.content}`).join("\n\n---\n\n");
      const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "Answer only from the provided approved TheOutHaven knowledge base sources. If the answer is not explicitly in the sources, say: I could not find that in the approved knowledge base. Cite source article titles used. Do not provide legal advice beyond the sources." },
          { role: "user", content: `Question: ${question}\n\nApproved sources:\n${context}` },
        ],
        temperature: 0.2,
      });
      answer = response.choices[0]?.message.content?.trim() || answer;
      if (answer.includes("I could not find that")) status = "no_answer";
    } catch {
      status = "error";
    }
  }
  await supabaseAdmin.from("knowledge_base_ai_questions").insert({ user_id: adminUser.user_id, question, answer, source_article_ids: articles.map((article) => article.id), status });
  return Response.json({ success: true, answer, status, sources: articles.map((article) => ({ id: article.id, title: article.title, slug: article.slug, excerpt: article.excerpt })) });
}
