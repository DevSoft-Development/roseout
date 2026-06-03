import Link from "next/link";
import { BookOpen, FileText, FolderTree, Globe, Layers, Plus, Search, Sparkles, ShieldCheck } from "lucide-react";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { roleCanEditKb, roleCanManageKb } from "@/lib/knowledge-base/access";
import { listKbArticles } from "@/lib/knowledge-base/server";
import KbTabs from "./KbTabs";

const featuredTitles = new Set([
  "Partner Ambassador Commission Rules",
  "Pro Plan Sales Script",
  "CRM Lead Status Definitions",
  "Claim Code and QR Mailer Process",
  "Support Escalation Rules",
]);

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm font-bold text-rose-100/60">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function QuickCard({ href, title, text, icon: Icon }: { href: string; title: string; text: string; icon: typeof BookOpen }) {
  return (
    <Link href={href} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-[#e1062a]/30 hover:bg-[#e1062a]/10">
      <Icon className="mb-4 h-7 w-7 text-red-400" />
      <h3 className="text-lg font-black text-white">{title}</h3>
      <p className="mt-2 text-sm text-rose-100/60">{text}</p>
    </Link>
  );
}

export default async function KnowledgeBasePage() {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  const { articles } = await listKbArticles(admin.role, admin.user_id, { pageSize: 50 });
  const canEdit = roleCanEditKb(admin.role);
  const canManage = roleCanManageKb(admin.role);
  const published = articles.filter((article) => article.status === "published").length;
  const drafts = articles.filter((article) => article.status === "draft").length;
  const templates = articles.filter((article) => article.template_type || article.article_type === "template").length;
  const aiApproved = articles.filter((article) => article.ai_approved).length;
  const featured = articles.filter((article) => featuredTitles.has(article.title));
  const recent = articles.slice(0, 6);

  return (
    <main className="px-4 pb-16 pt-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <KbTabs role={admin.role} />
        <section className="rounded-[2rem] border border-[#e1062a]/30 bg-gradient-to-br from-[#26030a] via-[#0d0d0d] to-[#050505] p-6 shadow-[0_18px_50px_rgba(225,6,42,0.22)] md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 inline-flex rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-rose-100">Knowledge Base</p>
              <h1 className="text-4xl font-black tracking-tight md:text-6xl">TheOutHaven operating playbook.</h1>
              <p className="mt-4 max-w-2xl text-base text-rose-100/70">Approved policies, scripts, support rules, templates, and public Help Center content for the team.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {canEdit ? <Link href="/admin/dashboard/knowledge-base/new" className="inline-flex items-center gap-2 rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white shadow-[0_18px_50px_rgba(225,6,42,0.22)]"><Plus className="h-4 w-4" /> New Article</Link> : null}
              <Link href="/admin/dashboard/knowledge-base/articles" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-black text-white">Manage Articles</Link>
            </div>
          </div>
          <form action="/admin/dashboard/knowledge-base/articles" className="mt-8 max-w-3xl">
            <div className="relative">
              <Search className="absolute left-4 top-3.5 h-5 w-5 text-rose-100/50" />
              <input name="q" placeholder="Search TheOutHaven policies, scripts, templates…" className="w-full rounded-2xl border border-white/10 bg-black/30 py-3 pl-12 pr-4 text-sm font-semibold text-white outline-none focus:border-[#e1062a]/50" />
            </div>
          </form>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="Published Articles" value={published} />
          <StatCard label="Drafts" value={drafts} />
          <StatCard label="Templates" value={templates} />
          <StatCard label="AI Approved" value={aiApproved} />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <QuickCard href="/admin/dashboard/knowledge-base/articles" title="Articles" text="Full article manager and search." icon={FileText} />
          <QuickCard href="/admin/dashboard/knowledge-base/templates" title="Templates" text="Scripts, SMS, emails, objections, and checklists." icon={Layers} />
          <QuickCard href="/admin/dashboard/knowledge-base/ai" title="AI Assistant" text="Answers only from approved internal KB sources." icon={Sparkles} />
          {canManage ? <QuickCard href="/admin/dashboard/knowledge-base/categories" title="Categories" text="Manage internal and public KB taxonomy." icon={FolderTree} /> : null}
          <QuickCard href="/help" title="Public Help Center" text="Guest and location-owner help articles." icon={Globe} />
        </section>

        {featured.length ? (
          <section>
            <h2 className="mb-4 text-2xl font-black">Featured internal articles</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {featured.map((article) => (
                <Link key={article.id} href={`/admin/dashboard/knowledge-base/${article.slug}`} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-[#e1062a]/30 hover:bg-[#e1062a]/10">
                  <ShieldCheck className="mb-3 h-5 w-5 text-red-400" />
                  <h3 className="font-black text-white">{article.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm text-rose-100/60">{article.excerpt || article.content}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {recent.length ? (
          <section>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black">Recent updates</h2>
              <Link href="/admin/dashboard/knowledge-base/articles" className="text-sm font-black text-rose-100">View all →</Link>
            </div>
            <div className="grid gap-3">
              {recent.map((article) => (
                <Link key={article.id} href={`/admin/dashboard/knowledge-base/${article.slug}`} className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/[0.04] p-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-black text-white">{article.title}</h3>
                    <p className="text-sm text-rose-100/60">{article.knowledge_base_categories?.name ?? "Uncategorized"} · {article.status} · {new Date(article.updated_at).toLocaleDateString()}</p>
                  </div>
                  <span className="rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 px-3 py-1 text-xs font-bold text-rose-100">{article.visibility}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-rose-100/70">No knowledge base records yet. Create an article or run the seed migration to add TheOutHaven starter content.</section>
        )}
      </div>
    </main>
  );
}
