"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Globe, Lock, Pencil, Plus, Search, Sparkles } from "lucide-react";
import type { KnowledgeBaseArticle, KnowledgeBaseCategory } from "@/lib/knowledge-base/types";
import { roleCanEditKb, roleCanManageKb } from "@/lib/knowledge-base/access";
import KbTabs from "./KbTabs";
import { kbArticleTypes, kbStatuses, kbTemplateTypes, kbVisibilities, templateTypeLabels } from "@/lib/knowledge-base/constants";

type Props = {
  articles: KnowledgeBaseArticle[];
  categories: KnowledgeBaseCategory[];
  role: string;
  page: number;
  pageSize: number;
  count: number;
  basePath?: string;
};

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 px-3 py-1 text-xs font-bold text-rose-100">{children}</span>;
}

export default function KnowledgeBaseClient({ articles, categories, role, page, pageSize, count, basePath = "/admin/dashboard/knowledge-base/articles" }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const canEdit = roleCanEditKb(role);
  const canManage = roleCanManageKb(role);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all") next.set(key, value); else next.delete(key);
    next.delete("page");
    router.push(`${basePath}?${next.toString()}`);
  };
  const featured = articles.filter((article) => article.is_featured).slice(0, 3);
  const templates = articles.filter((article) => article.article_type === "template" || article.template_type).slice(0, 6);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  return (
    <main className="px-4 pb-16 pt-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <KbTabs role={role} />
        <section className="rounded-[2rem] border border-[#e1062a]/30 bg-gradient-to-br from-[#26030a] via-[#0d0d0d] to-[#050505] p-6 shadow-[0_18px_50px_rgba(225,6,42,0.18)] md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-rose-100">Articles</p>
              <h1 className="text-4xl font-black tracking-tight md:text-6xl">Knowledge Base Articles</h1>
              <p className="mt-4 max-w-2xl text-base text-rose-100/70">Search, filter, edit, and manage approved internal guidance, templates, and public Help Center articles.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {canEdit && <Link href="/admin/dashboard/knowledge-base/new" className="inline-flex items-center gap-2 rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white shadow-[0_18px_50px_rgba(225,6,42,0.22)]"><Plus className="h-4 w-4" /> New Article</Link>}
              {canManage && <Link href="/admin/dashboard/knowledge-base/categories" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-black text-white">Manage Categories</Link>}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <div className="relative"><Search className="absolute left-4 top-3.5 h-5 w-5 text-rose-100/50" /><input defaultValue={params.get("q") ?? ""} onKeyDown={(e) => { if (e.key === "Enter") update("q", e.currentTarget.value); }} placeholder="Search articles, scripts, tags…" className="w-full rounded-2xl border border-white/10 bg-black/30 py-3 pl-12 pr-4 text-sm font-semibold text-white outline-none focus:border-[#e1062a]/50" /></div>
            <div className="mt-4 grid gap-3 md:grid-cols-5">
              <select onChange={(e) => update("category", e.target.value)} defaultValue={params.get("category") ?? "all"} className="rounded-2xl border border-white/10 bg-[#120b0a] p-3 text-sm"><option value="all">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <select onChange={(e) => update("status", e.target.value)} defaultValue={params.get("status") ?? "all"} className="rounded-2xl border border-white/10 bg-[#120b0a] p-3 text-sm"><option value="all">All statuses</option>{kbStatuses.map((s) => <option key={s}>{s}</option>)}</select>
              <select onChange={(e) => update("type", e.target.value)} defaultValue={params.get("type") ?? "all"} className="rounded-2xl border border-white/10 bg-[#120b0a] p-3 text-sm"><option value="all">All types</option>{kbArticleTypes.map((s) => <option key={s}>{s}</option>)}</select>
              <select onChange={(e) => update("visibility", e.target.value)} defaultValue={params.get("visibility") ?? "all"} className="rounded-2xl border border-white/10 bg-[#120b0a] p-3 text-sm"><option value="all">All visibility</option>{kbVisibilities.map((s) => <option key={s}>{s}</option>)}</select>
              <select onChange={(e) => update("template", e.target.value)} defaultValue={params.get("template") ?? "all"} className="rounded-2xl border border-white/10 bg-[#120b0a] p-3 text-sm"><option value="all">All templates</option>{kbTemplateTypes.map((s) => <option key={s} value={s}>{templateTypeLabels[s]}</option>)}</select>
            </div>
          </div>
          <div className="grid gap-3">
            <Link href="/admin/dashboard/knowledge-base/ai" className="rounded-3xl border border-[#e1062a]/30 bg-[#e1062a]/10 p-5"><Sparkles className="mb-3 h-6 w-6 text-rose-100" /><b>KB AI Assistant</b><p className="mt-1 text-sm text-rose-100/65">Ask questions answered only from approved content.</p></Link>
            <Link href="/help" className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><Globe className="mb-3 h-6 w-6 text-rose-100" /><b>Public Help Center</b><p className="mt-1 text-sm text-rose-100/65">Review guest and owner-facing help.</p></Link>
          </div>
        </section>

        {featured.length > 0 && <section><h2 className="mb-4 text-2xl font-black">Featured Articles</h2><div className="grid gap-4 md:grid-cols-3">{featured.map((article) => <ArticleCard key={article.id} article={article} canEdit={canEdit} />)}</div></section>}
        {templates.length > 0 && <section><div className="mb-4 flex items-center justify-between"><h2 className="text-2xl font-black">Template Library</h2><Link href="/admin/dashboard/knowledge-base/templates" className="text-sm font-black text-rose-100">View all →</Link></div><div className="grid gap-4 md:grid-cols-3">{templates.map((article) => <ArticleCard key={article.id} article={article} canEdit={canEdit} compact />)}</div></section>}
        <section><h2 className="mb-4 text-2xl font-black">Recent Articles</h2><div className="grid gap-4">{articles.map((article) => <ArticleRow key={article.id} article={article} canEdit={canEdit} />)}</div></section>
        <div className="flex justify-between"><button disabled={page <= 1} onClick={() => update("page", String(page - 1))} className="rounded-full border border-white/10 px-4 py-2 disabled:opacity-40">Previous</button><span className="text-sm text-rose-100/60">Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => update("page", String(page + 1))} className="rounded-full border border-white/10 px-4 py-2 disabled:opacity-40">Next</button></div>
      </div>
    </main>
  );
}

function ArticleCard({ article, canEdit, compact }: { article: KnowledgeBaseArticle; canEdit: boolean; compact?: boolean }) {
  return <Link href={`/admin/dashboard/knowledge-base/${article.slug}`} className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 transition hover:border-[#e1062a]/30 hover:bg-white/[0.07]"><div className="mb-3 flex gap-2"><Chip>{article.article_type}</Chip>{article.visibility === "internal" ? <Lock className="h-4 w-4 text-rose-100/60" /> : <Globe className="h-4 w-4 text-rose-100/60" />}</div><h3 className="text-lg font-black">{article.title}</h3><p className="mt-2 line-clamp-3 text-sm text-rose-100/65">{article.excerpt || article.content}</p>{!compact && <div className="mt-4 flex flex-wrap gap-2">{article.tags.slice(0, 4).map((tag) => <Chip key={tag}>{tag}</Chip>)}</div>}{canEdit && <span className="mt-4 inline-flex items-center gap-1 text-xs font-black text-rose-100"><Pencil className="h-3 w-3" /> Edit available</span>}</Link>;
}

function ArticleRow({ article, canEdit }: { article: KnowledgeBaseArticle; canEdit: boolean }) {
  return <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-5 md:flex-row md:items-center md:justify-between"><Link href={`/admin/dashboard/knowledge-base/${article.slug}`}><div className="flex items-center gap-3"><FileText className="h-5 w-5 text-rose-100" /><div><h3 className="font-black">{article.title}</h3><p className="text-sm text-rose-100/60">{article.knowledge_base_categories?.name ?? "Uncategorized"} · {article.status} · {article.visibility}</p></div></div></Link><div className="flex gap-2">{article.ai_approved && <Chip>AI approved</Chip>}{article.template_type && <Chip>{templateTypeLabels[article.template_type] ?? article.template_type}</Chip>}{canEdit && <Link href={`/admin/dashboard/knowledge-base/${article.slug}/edit`} className="rounded-full border border-white/10 px-3 py-2 text-xs font-black"><Pencil className="inline h-3 w-3" /> Edit</Link>}</div></div>;
}
