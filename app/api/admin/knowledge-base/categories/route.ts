import { NextRequest } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getKbCategories, slugifyKb } from "@/lib/knowledge-base/server";
import { roleCanManageKb } from "@/lib/knowledge-base/access";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  if (error) return error;
  const categories = await getKbCategories(false);
  return Response.json({ success: true, categories });
}

export async function POST(request: NextRequest) {
  const { error, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.knowledgeBase);
  if (error) return error;
  if (!roleCanManageKb(adminUser.role)) return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const payload = {
    name: String(body.name || "").trim(),
    slug: slugifyKb(body.slug || body.name || ""),
    description: body.description || null,
    icon: body.icon || null,
    audience: body.audience || "internal",
    sort_order: Number(body.sort_order || 0),
    is_active: body.is_active !== false,
    updated_by: adminUser.user_id,
    created_by: body.id ? undefined : adminUser.user_id,
  };
  const result = body.id
    ? await supabaseAdmin.from("knowledge_base_categories").update(payload).eq("id", body.id).select("*").single()
    : await supabaseAdmin.from("knowledge_base_categories").insert(payload).select("*").single();
  if (result.error) return Response.json({ success: false, error: result.error.message }, { status: 400 });
  return Response.json({ success: true, category: result.data });
}
