import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AdminRole } from "@/lib/users/roles";
import { normalizeKbRole, roleCanManageKb, roleCanViewArticle } from "./access";
import type { KnowledgeBaseArticle, KnowledgeBaseArticleStatus, KnowledgeBaseVisibility } from "./types";

export const KB_SELECT = "*, knowledge_base_categories(id,name,slug,audience)";

export type KbFilters = {
  q?: string | null;
  category?: string | null;
  type?: string | null;
  template?: string | null;
  status?: string | null;
  visibility?: string | null;
  page?: number;
  pageSize?: number;
  publicOnly?: boolean;
};

export function slugifyKb(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

export function filterArticleForRole<T extends { visibility: string; allowed_roles: string[] | null; status: string; created_by?: string | null }>(
  article: T,
  role: AdminRole | string | null,
  userId?: string | null,
  includeDrafts = false,
) {
  if (roleCanManageKb(role)) return true;
  if (includeDrafts && normalizeKbRole(role) === "editor" && article.created_by === userId) return true;
  return article.status === "published" && roleCanViewArticle(role, article);
}

export async function listKbArticles(role: AdminRole | string | null, userId: string | null, filters: KbFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = supabaseAdmin.from("knowledge_base_articles").select(KB_SELECT, { count: "exact" }).order("is_featured", { ascending: false }).order("updated_at", { ascending: false }).range(from, to);
  if (filters.publicOnly) query = query.eq("status", "published").in("visibility", ["public", "both"]);
  else if (!roleCanManageKb(role)) query = query.eq("status", "published");
  if (filters.status && filters.status !== "all" && !filters.publicOnly) query = query.eq("status", filters.status);
  if (filters.visibility && filters.visibility !== "all") query = query.eq("visibility", filters.visibility);
  if (filters.type && filters.type !== "all") query = query.eq("article_type", filters.type);
  if (filters.template && filters.template !== "all") query = query.eq("template_type", filters.template);
  if (filters.category && filters.category !== "all") query = query.eq("category_id", filters.category);
  const q = filters.q?.trim();
  if (q) {
    const safe = q.replace(/[%_,]/g, "");
    query = query.or(`title.ilike.%${safe}%,excerpt.ilike.%${safe}%,content.ilike.%${safe}%`);
  }
  const { data, error, count } = await query;
  if (error) throw error;
  const articles = ((data ?? []) as KnowledgeBaseArticle[]).filter((article) =>
    filters.publicOnly ? true : filterArticleForRole(article, role, userId, true),
  );
  return { articles, count: count ?? articles.length, page, pageSize };
}

export async function getKbCategories(publicOnly = false) {
  let query = supabaseAdmin.from("knowledge_base_categories").select("*").order("sort_order").order("name");
  if (publicOnly) query = query.eq("is_active", true).in("audience", ["public", "both"]);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export type KbArticlePayload = {
  title: string;
  slug?: string;
  category_id?: string | null;
  excerpt?: string | null;
  content: string;
  status?: KnowledgeBaseArticleStatus;
  visibility?: KnowledgeBaseVisibility;
  allowed_roles?: string[];
  article_type?: string;
  template_type?: string | null;
  tags?: string[];
  is_featured?: boolean;
  ai_approved?: boolean;
  public_audience?: string[];
};

export function sanitizeKbPayload(payload: KbArticlePayload, role: string | null) {
  const manager = roleCanManageKb(role);
  const status = manager ? (payload.status ?? "draft") : "draft";
  return {
    title: payload.title.trim(),
    slug: slugifyKb(payload.slug || payload.title),
    category_id: payload.category_id || null,
    excerpt: payload.excerpt?.trim() || null,
    content: payload.content,
    status,
    visibility: payload.visibility ?? "internal",
    allowed_roles: payload.allowed_roles?.length ? payload.allowed_roles : ["superadmin", "admin", "editor", "viewer"],
    article_type: payload.article_type ?? "article",
    template_type: payload.template_type || null,
    tags: payload.tags ?? [],
    is_featured: Boolean(payload.is_featured),
    ai_approved: manager ? Boolean(payload.ai_approved) : false,
    public_audience: payload.public_audience ?? [],
    published_at: status === "published" ? new Date().toISOString() : null,
  };
}
