import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { featureMarketingOpportunity } from "@/lib/marketing/opportunities";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingEdit);
  if (auth.error) return auth.error;
  if (!auth.adminUser) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await context.params;
    const item = await featureMarketingOpportunity(id, auth.adminUser.user_id);
    return NextResponse.json({ success: true, content_item_id: item.id, href: `/admin/dashboard/marketing/content/${item.id}` });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not create content from opportunity." }, { status: 500 });
  }
}
