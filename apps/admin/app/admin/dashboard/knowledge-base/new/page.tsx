import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getKbCategories } from "@/lib/knowledge-base/server";
import { roleCanEditKb } from "@/lib/knowledge-base/access";
import { redirect } from "next/navigation";
import ArticleForm from "../ArticleForm";
import KbTabs from "../KbTabs";
import { AdminPageHeader, AdminPageShell, AdminStatusBadge } from "../../../../../components/admin/AdminDesignSystem";

export default async function Page() {
  const admin = await requireAdminRole(["superadmin","admin","editor"]);
  if (!roleCanEditKb(admin.role)) redirect("/admin/unauthorized");
  const categories = await getKbCategories();
  return (
    <AdminPageShell>
      <AdminPageHeader eyebrow="Knowledge Base · Authoring" title="New Knowledge Base Article" subtitle="Create governed internal knowledge for approved teams and AI-assisted answers." badge={<AdminStatusBadge tone="blue">Draft authoring</AdminStatusBadge>} />
      <KbTabs />
      <ArticleForm categories={categories} />
    </AdminPageShell>
  );
}
