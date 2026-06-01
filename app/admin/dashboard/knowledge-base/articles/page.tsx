import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getKbCategories, listKbArticles } from "@/lib/knowledge-base/server";
import KnowledgeBaseClient from "../KnowledgeBaseClient";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function KbArticlesPage({ searchParams }: Props) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  const sp = await searchParams;
  const [categories, result] = await Promise.all([
    getKbCategories(false),
    listKbArticles(admin.role, admin.user_id, {
      q: first(sp.q),
      category: first(sp.category),
      type: first(sp.type),
      template: first(sp.template),
      status: first(sp.status),
      visibility: first(sp.visibility),
      page: Number(first(sp.page) || 1),
      pageSize: 20,
    }),
  ]);

  return <KnowledgeBaseClient articles={result.articles} categories={categories} role={admin.role} page={result.page} pageSize={result.pageSize} count={result.count} />;
}
