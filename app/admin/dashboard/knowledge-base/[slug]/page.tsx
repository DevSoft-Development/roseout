import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Archive, Copy, Pencil, ShieldCheck } from "lucide-react";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { roleCanEditKb, roleCanManageKb } from "@/lib/knowledge-base/access";
import { filterArticleForRole, KB_SELECT } from "@/lib/knowledge-base/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Props = { params: Promise<{ slug: string }> };

export default async function KbArticlePage({ params }: Props) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  const { slug } = await params;
  const { data: article } = await supabaseAdmin.from("knowledge_base_articles").select(KB_SELECT).eq("slug", slug).in("visibility", ["internal", "both"]).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!article) notFound();
  if (!filterArticleForRole(article, admin.role, admin.user_id, true)) redirect("/admin/unauthorized");
  const { data: related } = await supabaseAdmin.from("knowledge_base_articles").select("id,title,slug,excerpt,visibility,allowed_roles,status").eq("status", "published").eq("category_id", article.category_id).neq("id", article.id).limit(4);
  const canEdit = roleCanEditKb(admin.role);
  return <main className="px-4 pb-16 pt-8 text-white sm:px-6 lg:px-8"><article className="mx-auto max-w-5xl space-y-6"><Link href="/admin/dashboard/knowledge-base" className="text-sm font-black text-amber-100">← Knowledge Base</Link><section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 md:p-8"><div className="mb-4 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.18em] text-rose-100/60"><span>{article.knowledge_base_categories?.name ?? "Uncategorized"}</span><span>· {article.status}</span><span>· {article.visibility}</span><span>· updated {new Date(article.updated_at).toLocaleDateString()}</span></div><h1 className="text-4xl font-black md:text-5xl">{article.title}</h1>{article.excerpt && <p className="mt-4 text-lg text-rose-100/70">{article.excerpt}</p>}<div className="mt-5 flex flex-wrap gap-2">{article.tags.map((tag: string) => <span key={tag} className="rounded-full border border-amber-200/15 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-100">{tag}</span>)}{article.ai_approved && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100"><ShieldCheck className="h-3 w-3" /> AI approved</span>}</div><div className="mt-6 flex flex-wrap gap-3">{article.template_type && <button className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black"><Copy className="mr-2 inline h-4 w-4" />Copy Template</button>}{canEdit && <Link href={`/admin/dashboard/knowledge-base/${article.slug}/edit`} className="rounded-full bg-amber-200 px-4 py-2 text-sm font-black text-[#32130f]"><Pencil className="mr-2 inline h-4 w-4" />Edit</Link>}{roleCanManageKb(admin.role) && <button className="rounded-full border border-rose-200/20 px-4 py-2 text-sm font-black text-rose-100"><Archive className="mr-2 inline h-4 w-4" />Archive</button>}</div></section><section className="rounded-[2rem] border border-white/10 bg-[#120b0a] p-6 leading-8 text-rose-50/90 whitespace-pre-wrap">{article.content}</section><section><h2 className="mb-3 text-2xl font-black">Related articles</h2><div className="grid gap-3 md:grid-cols-2">{(related ?? []).filter((item) => filterArticleForRole(item, admin.role, admin.user_id)).map((item) => <Link key={item.id} href={`/admin/dashboard/knowledge-base/${item.slug}`} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4"><b>{item.title}</b><p className="mt-1 text-sm text-rose-100/60">{item.excerpt}</p></Link>)}</div></section></article></main>;
}
