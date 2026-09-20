import { notFound, redirect } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { getKbCategories, KB_SELECT } from "@/lib/knowledge-base/server";
import { roleCanEditKb } from "@/lib/knowledge-base/access";
import ArticleForm from "../../ArticleForm";
import KbTabs from "../../KbTabs";
import { AdminPageHeader, AdminPageShell, AdminStatusBadge } from "../../../../../../components/admin/AdminDesignSystem";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const admin = await requireAdminRole(["superadmin","admin","editor"]);
  if (!roleCanEditKb(admin.role)) redirect("/admin/unauthorized");
  const { slug } = await params;
  const [{ data }, categories] = await Promise.all([
    getAdminDatabaseClient().from("knowledge_base_articles").select(KB_SELECT).eq("slug", slug).maybeSingle(),
    getKbCategories(),
  ]);
  if (!data) notFound();
  return (
    <AdminPageShell>
      <AdminPageHeader eyebrow="Knowledge Base · Authoring" title="Edit Knowledge Base Article" subtitle={String((data as any).title || slug)} badge={<AdminStatusBadge tone="amber">Editing</AdminStatusBadge>} />
      <KbTabs />
      <ArticleForm article={data} categories={categories} />
    </AdminPageShell>
  );
}
