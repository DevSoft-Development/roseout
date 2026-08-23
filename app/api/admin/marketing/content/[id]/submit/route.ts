import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { submitMarketingContentForApproval } from "@/lib/marketing/content-operations";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingEdit);
  if (auth.error) return auth.error;
  if (!auth.adminUser) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const result = await submitMarketingContentForApproval(
      id,
      {
        user_id: auth.adminUser.user_id,
        email: auth.adminUser.email || null,
        role: auth.adminUser.role,
      },
      typeof body.approver_user_id === "string" ? body.approver_user_id : null,
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not submit content for approval." },
      { status: 400 },
    );
  }
}
