import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { listKbArticles, getKbCategories } from "@/lib/knowledge-base/server";
import KbTabs from "./KbTabs";
import {
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdminRole([
    "superadmin",
    "admin",
    "editor",
    "reviewer",
    "ambassador",
    "experience_team",
    "partner_ambassador",
    "marketing_intern",
    "marketing_specialist",
    "marketing_manager",
    "viewer",
  ]);
  const sp = await searchParams;
  const [{ articles, count }, { length: categoryCount }] = await Promise.all([
    listKbArticles(admin.role, admin.user_id, {
      q: sp.q,
      status: sp.status,
      page: Number(sp.page || 1),
      pageSize: 30,
    }),
    getKbCategories(),
  ]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Admin · Knowledge"
        title="Knowledge Base"
        subtitle="Search, review, and maintain internal knowledge articles available to the Admin team."
        badge={<AdminStatusBadge tone="blue">{count} articles</AdminStatusBadge>}
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Articles" value={count} helper="Matching current access and filters" />
        <AdminKpiCard label="Categories" value={categoryCount} helper="Knowledge organization" />
      </AdminKpiGrid>

      <KbTabs />

      <form className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:flex-row">
        <input
          name="q"
          defaultValue={sp.q || ""}
          placeholder="Search knowledge base"
          className="min-h-11 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-red-500/40"
        />
        <select
          name="status"
          defaultValue={sp.status || "all"}
          className="min-h-11 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-red-500/40"
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <button className="min-h-11 rounded-xl bg-red-600 px-5 text-sm font-black text-white transition hover:bg-red-500">
          Search
        </button>
      </form>

      <div className="grid gap-3">
        {articles.map((article) => (
          <Link
            key={article.id}
            href={`/admin/dashboard/knowledge-base/${article.slug}`}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-red-500/30 hover:bg-white/[0.055]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black">{article.title}</h2>
              <span className="rounded-full bg-white/10 px-2 py-1 text-xs">{article.status}</span>
              <span className="rounded-full bg-white/10 px-2 py-1 text-xs">{article.visibility}</span>
              {article.is_featured && (
                <span className="rounded-full bg-red-500/15 px-2 py-1 text-xs text-red-100">Featured</span>
              )}
            </div>
            <p className="mt-2 text-sm text-white/55">{article.excerpt || article.content.slice(0, 180)}</p>
          </Link>
        ))}
      </div>
    </AdminPageShell>
  );
}
