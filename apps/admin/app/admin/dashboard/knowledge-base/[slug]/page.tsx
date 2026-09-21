import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { filterArticleForRole, KB_SELECT } from "@/lib/knowledge-base/server";
import KbTabs from "../KbTabs";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const admin = await requireAdminRole(["superadmin","admin","editor","reviewer","ambassador","experience_team","partner_ambassador","marketing_intern","marketing_specialist","marketing_manager","viewer"]);
  const { slug } = await params;
  const { data, error } = await getAdminDatabaseClient().from("knowledge_base_articles").select(KB_SELECT).eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data || !filterArticleForRole(data as any, admin.role, admin.user_id, true)) notFound();
  const a = data as any;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Knowledge Base · Article"
        title={a.title}
        subtitle={a.excerpt || "Published operating knowledge and guidance."}
        badge={<AdminStatusBadge tone={a.status === "published" ? "green" : a.status === "draft" ? "amber" : "muted"}>{a.status}</AdminStatusBadge>}
        actions={["superadmin","admin","editor"].includes(admin.role) ? <AdminActionButton href={`/admin/dashboard/knowledge-base/${a.slug}/edit`} variant="primary">Edit Article</AdminActionButton> : undefined}
      />
      <KbTabs />
      <div className="flex flex-wrap gap-2">
        <AdminStatusBadge tone="blue">{a.visibility}</AdminStatusBadge>
        <AdminStatusBadge tone="muted">{a.article_type}</AdminStatusBadge>
      </div>
      <article className="whitespace-pre-wrap rounded-3xl border border-white/10 bg-white/[0.04] p-6 leading-7">{a.content}</article>
      <Link href="/admin/dashboard/knowledge-base" className="inline-flex text-sm font-bold text-rose-200">← Knowledge Base</Link>
    </AdminPageShell>
  );
}
