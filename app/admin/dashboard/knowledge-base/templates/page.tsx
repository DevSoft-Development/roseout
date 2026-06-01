import Link from "next/link";
import { Copy, Mail, MessageSquare, Smartphone } from "lucide-react";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { roleCanEditKb } from "@/lib/knowledge-base/access";
import { kbTemplateTypes, templateTypeLabels } from "@/lib/knowledge-base/constants";
import { listKbArticles } from "@/lib/knowledge-base/server";
import CopyButton from "../CopyButton";
import KbTabs from "../KbTabs";

const iconFor = (type: string) => (type === "email" ? Mail : type === "sms" ? Smartphone : type === "sales_script" ? MessageSquare : Copy);

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function KbTemplatesPage({ searchParams }: Props) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  const sp = await searchParams;
  const q = first(sp.q)?.toLowerCase().trim() ?? "";
  const { articles } = await listKbArticles(admin.role, admin.user_id, { template: "all", pageSize: 50, q });
  const templates = articles.filter((article) => article.template_type || article.article_type === "template");

  return (
    <main className="px-4 pb-16 pt-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <KbTabs role={admin.role} />
        <section className="rounded-[2rem] border border-[#e1062a]/30 bg-gradient-to-br from-[#26030a] via-[#0d0d0d] to-[#050505] p-6 shadow-[0_18px_50px_rgba(225,6,42,0.18)] md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-100">Reusable Templates</p>
              <h1 className="mt-2 text-4xl font-black">KB Template Library</h1>
              <p className="mt-3 text-rose-100/70">Sales scripts, emails, SMS, objection responses, onboarding checklists, support replies, and ambassador scripts.</p>
            </div>
            {roleCanEditKb(admin.role) ? <Link href="/admin/dashboard/knowledge-base/new" className="rounded-full bg-[#e1062a] px-5 py-3 font-black text-white shadow-[0_18px_50px_rgba(225,6,42,0.22)]">Create Template</Link> : null}
          </div>
          <form className="mt-6 max-w-2xl">
            <input name="q" defaultValue={q} placeholder="Search templates…" className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[#e1062a]/50" />
          </form>
        </section>

        {kbTemplateTypes.map((type) => {
          const group = templates.filter((article) => article.template_type === type);
          const Icon = iconFor(type);
          return (
            <section key={type} className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-5">
              <h2 className="mb-4 flex items-center gap-2 text-2xl font-black"><Icon className="h-5 w-5 text-red-400" />{templateTypeLabels[type]}</h2>
              {group.length ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {group.map((article) => (
                    <article key={article.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                      <Link href={`/admin/dashboard/knowledge-base/${article.slug}`} className="block">
                        <h3 className="font-black">{article.title}</h3>
                        <p className="mt-2 line-clamp-3 text-sm text-rose-100/65">{article.excerpt || article.content}</p>
                      </Link>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <CopyButton text={article.content} label="Copy" />
                        <Link href={`/admin/dashboard/knowledge-base/${article.slug}`} className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-white/80">Open</Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-3xl border border-white/10 bg-black/20 p-5 text-sm text-rose-100/60">No {templateTypeLabels[type].toLowerCase()} yet.</p>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
