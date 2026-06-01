import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { roleCanUseKbAi } from "@/lib/knowledge-base/access";
import AiClient from "./AiClient";
export default async function KbAiPage(){ const admin=await requireAdminRole(ADMIN_PAGE_ACCESS.knowledgeBase); if(!roleCanUseKbAi(admin.role)) redirect('/admin/unauthorized'); return <main className="px-4 pb-16 pt-8 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-5xl"><AiClient/></div></main> }
