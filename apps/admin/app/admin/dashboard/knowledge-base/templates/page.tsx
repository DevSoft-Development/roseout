import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { listKbArticles } from "@/lib/knowledge-base/server";
import KbTabs from "../KbTabs";
import { AdminKpiCard, AdminKpiGrid, AdminPageHeader, AdminPageShell, AdminStatusBadge } from "../../../../../components/admin/AdminDesignSystem";

export default async function Page() {
  const admin = await requireAdminRole(["superadmin","admin","editor","reviewer","ambassador","experience_team","partner_ambassador","marketing_intern","marketing_specialist","marketing_manager","viewer"]);
  const { articles } = await listKbArticles(admin.role, admin.user_id, { type: "template", pageSize: 50 });
  return (
    <AdminPageShell>
      <AdminPageHeader eyebrow="Knowledge Base · Reuse" title="Knowledge Base Templates" subtitle="Reusable operating templates available to your role." badge={<AdminStatusBadge tone="blue">{articles.length} templates</AdminStatusBadge>} />
      <AdminKpiGrid><AdminKpiCard label="Templates" value={articles.length} helper="Visible to your role" /></AdminKpiGrid>
      <KbTabs />
      <div className="grid gap-4">
        {articles.map((a) => <div key={a.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black">{a.title}</h2><AdminStatusBadge tone={a.status === "published" ? "green" : "amber"}>{a.status}</AdminStatusBadge></div><div className="mt-1 text-xs text-white/50">{a.template_type || "template"}</div><pre className="mt-4 whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-sm">{a.content}</pre></div>)}
      </div>
    </AdminPageShell>
  );
}
