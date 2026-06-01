import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { roleCanEditKb } from "@/lib/knowledge-base/access";
import { getKbCategories } from "@/lib/knowledge-base/server";
import ArticleForm from "../ArticleForm";
export default async function NewKbArticlePage() { const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.knowledgeBase); if (!roleCanEditKb(admin.role)) redirect("/admin/unauthorized"); const categories = await getKbCategories(false); return <main className="px-4 pb-16 pt-8 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-5xl"><h1 className="mb-6 text-4xl font-black">New Knowledge Base Article</h1><ArticleForm categories={categories} role={admin.role} /></div></main>; }
