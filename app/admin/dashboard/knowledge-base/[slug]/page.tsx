import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Archive, Globe, Pencil, ShieldCheck } from "lucide-react";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { roleCanEditKb, roleCanManageKb, roleLabels } from "@/lib/knowledge-base/access";
import { filterArticleForRole, KB_SELECT } from "@/lib/knowledge-base/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import CopyButton from "../CopyButton";
import KbTabs from "../KbTabs";

type Props = { params: Promise<{ slug: string }> };

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 px-3 py-1 text-xs font-bold text-rose-100">{children}</span>;
}

export default async function KbArticleDetailPage({ params }: Props) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  const { slug } = await params;
  const { data: article } = await supabaseAdmin.from("knowledge_base_articles").select(KB_SELECT).eq("slug", slug).limit(1).maybeSingle();
  if (!article) notFound();
  if (!filterArticleForRole(article, admin.role, admin.user_id, true)) redirect("/admin/unauthorized");
  const canEdit = roleCanEditKb(admin.role);
  const { data: related } = await supabaseAdmin
    .from("knowledge_base_articles")
    .select(KB_SELECT)
    .eq("status", "published")
    .eq("category_id", article.category_id)
    .neq("id", article.id)
    .limit(4);
  const visibleRelated = (related ?? []).filter((item) => filterArticleForRole(item, admin.role, admin.user_id));

  return (
    <main className="px-4 pb-16 pt-8 text-white sm:px-6 lg:px-8">
      <article className="mx-auto max-w-6xl space-y-6">
        <KbTabs role={admin.role} />
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-rose-100/60">
          <Link href="/admin/dashboard/knowledge-base" className="text-rose-100 hover:text-red-400">Knowledge Base</Link>
          <span>/</span>
          <span>{article.knowledge_base_categories?.name ?? "Uncategorized"}</span>
          <span>/</span>
          <span className="text-white/80">{article.title}</span>
        </div>
        <section className="rounded-[2rem] border border-[#e1062a]/30 bg-gradient-to-br from-[#26030a] via-[#0d0d0d] to-[#050505] p-6 shadow-[0_18px_50px_rgba(225,6,42,0.18)] md:p-8">
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge>{article.status}</Badge>
            <Badge>{article.visibility}</Badge>
            <Badge>{article.article_type}</Badge>
            {article.visibility === "public" || article.visibility === "both" ? <Badge>Public Help Article</Badge> : null}
            {article.ai_approved ? <span className="inline-flex items-center gap-1 rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 px-3 py-1 text-xs font-bold text-rose-100"><ShieldCheck className="h-3 w-3" /> AI approved</span> : null}
          </div>
          <h1 className="text-4xl font-black md:text-5xl">{article.title}</h1>
          {article.excerpt ? <p className="mt-4 text-lg text-rose-100/70">{article.excerpt}</p> : null}
          <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-rose-100/45">Updated {new Date(article.updated_at).toLocaleDateString()}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {article.allowed_roles.map((role: string) => <Badge key={role}>{roleLabels[role] ?? role}</Badge>)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {article.tags.map((tag: string) => <Badge key={tag}>{tag}</Badge>)}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <CopyButton text={article.content} label={article.template_type ? "Copy Template" : "Copy Article"} />
            {canEdit ? <Link href={`/admin/dashboard/knowledge-base/${article.slug}/edit`} className="rounded-full bg-[#e1062a] px-4 py-2 text-sm font-black text-white shadow-[0_18px_50px_rgba(225,6,42,0.18)]"><Pencil className="mr-2 inline h-4 w-4" />Edit</Link> : null}
            {roleCanManageKb(admin.role) ? <button className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-rose-100"><Archive className="mr-2 inline h-4 w-4" />Archive</button> : null}
          </div>
        </section>
        <section className="whitespace-pre-wrap rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-6 leading-8 text-rose-50/90">{article.content}</section>
        {visibleRelated.length ? (
          <section>
            <h2 className="mb-3 text-2xl font-black">Related articles</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {visibleRelated.map((item) => (
                <Link key={item.id} href={`/admin/dashboard/knowledge-base/${item.slug}`} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-[#e1062a]/30 hover:bg-[#e1062a]/10">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold text-rose-100/60"><Globe className="h-3.5 w-3.5" /> {item.visibility}</div>
                  <b>{item.title}</b>
                  <p className="mt-1 text-sm text-rose-100/60">{item.excerpt}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </main>
  );
}
