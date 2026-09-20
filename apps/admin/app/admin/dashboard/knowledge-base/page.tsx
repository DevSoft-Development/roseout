import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { listKbArticles, getKbCategories } from "@/lib/knowledge-base/server";
import KbTabs from "./KbTabs";
import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requireAdminRole(["superadmin","admin","editor","reviewer","ambassador","experience_team","partner_ambassador","marketing_intern","marketing_specialist","marketing_manager","viewer"]);
  const sp = await searchParams;
  const [{ articles, count }, categories] = await Promise.all([
    listKbArticles(admin.role, admin.user_id, { q: sp.q, status: sp.status, page: Number(sp.page || 1), pageSize: 30 }),
    getKbCategories(),
  ]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Operations · Knowledge"
        title="Knowledge Base"
        subtitle="Search, maintain, and govern internal operating knowledge across teams."
        badge={<AdminStatusBadge tone="blue">{count} articles</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/knowledge-base/new" variant="primary">New Article</AdminActionButton>}
      />
      <AdminKpiGrid>
        <AdminKpiCard label="Articles" value={count} helper="Visible to your role" />
        <AdminKpiCard label="Categories" value={categories.length} helper="Knowledge organization" />
      </AdminKpiGrid>
      <KbTabs />
      <form className="flex flex-col gap-3 md:flex-row">
        <input name="q" defaultValue={sp.q || ""} placeholder="Search knowledge base" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 p-3" />
        <select name="status" defaultValue={sp.status || "all"} className="rounded-xl border border-white/10 bg-black/30 p-3">
          <option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option>
        </select>
        <button className="rounded-xl bg-white px-5 py-3 font-black text-black">Search</button>
      </form>
      <div className="grid gap-3">
        {articles.map((a) => (
          <Link key={a.id} href={`/admin/dashboard/knowledge-base/${a.slug}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-white/20 hover:bg-white/[0.06]">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black">{a.title}</h2>
              <AdminStatusBadge tone={a.status === "published" ? "green" : a.status === "draft" ? "amber" : "muted"}>{a.status}</AdminStatusBadge>
              <AdminStatusBadge tone="blue">{a.visibility}</AdminStatusBadge>
              {a.is_featured ? <AdminStatusBadge tone="red">Featured</AdminStatusBadge> : null}
            </div>
            <p className="mt-2 text-sm text-white/55">{a.excerpt || a.content.slice(0,180)}</p>
          </Link>
        ))}
      </div>
    </AdminPageShell>
  );
}
