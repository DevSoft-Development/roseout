import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { decideMarketingApproval } from "@/lib/marketing/content-operations";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingApprove);
  if (auth.error) return auth.error;
  if (!auth.adminUser) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await req.json();
    const approvalId = typeof body.approval_id === "string" ? body.approval_id : "";
    const decision = body.decision as "approved" | "changes_requested" | "rejected";
    if (!approvalId || !["approved", "changes_requested", "rejected"].includes(decision)) {
      return NextResponse.json({ success: false, error: "Invalid approval decision." }, { status: 400 });
    }

    const item = await decideMarketingApproval(
      id,
      approvalId,
      decision,
      typeof body.notes === "string" ? body.notes.trim() : "",
      {
        user_id: auth.adminUser.user_id,
        email: auth.adminUser.email || null,
        role: auth.adminUser.role,
      },
    );
    return NextResponse.json({ success: true, item });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not record approval decision." },
      { status: 400 },
    );
  }
}
