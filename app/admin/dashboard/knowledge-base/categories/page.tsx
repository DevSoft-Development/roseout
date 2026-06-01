import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { roleCanManageKb } from "@/lib/knowledge-base/access";
import { getKbCategories } from "@/lib/knowledge-base/server";
import CategoriesClient from "./CategoriesClient";
export default async function KbCategoriesPage(){ const admin=await requireAdminRole(ADMIN_PAGE_ACCESS.knowledgeBase); if(!roleCanManageKb(admin.role)) redirect('/admin/unauthorized'); const categories=await getKbCategories(false); return <main className="px-4 pb-16 pt-8 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-5xl"><h1 className="mb-6 text-4xl font-black">Knowledge Base Categories</h1><CategoriesClient categories={categories}/></div></main> }
