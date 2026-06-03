import { notFound, redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { roleCanEditKb } from "@/lib/knowledge-base/access";
import { filterArticleForRole, getKbCategories, KB_SELECT } from "@/lib/knowledge-base/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import ArticleForm from "../../ArticleForm";
import KbTabs from "../../KbTabs";

type Props = { params: Promise<{ slug: string }> };

export default async function EditKbArticlePage({ params }: Props) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  if (!roleCanEditKb(admin.role)) redirect("/admin/unauthorized");
  const { slug } = await params;
  const { data: article } = await supabaseAdmin.from("knowledge_base_articles").select(KB_SELECT).eq("slug", slug).limit(1).maybeSingle();
  if (!article) notFound();
  if (!filterArticleForRole(article, admin.role, admin.user_id, true)) redirect("/admin/unauthorized");
  const categories = await getKbCategories(false);
  return (
    <main className="px-4 pb-16 pt-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <KbTabs role={admin.role} />
        <h1 className="text-4xl font-black">Edit Article</h1>
        <ArticleForm categories={categories} role={admin.role} article={article} />
      </div>
    </main>
  );
}
