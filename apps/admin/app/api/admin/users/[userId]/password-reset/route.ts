import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { logAdminAuditEvent } from "@/lib/admin-audit-log";
import { getAdminUserDetail, sendUserPasswordReset } from "@/lib/admin/admin-user-detail";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireAdminApiRole(["superadmin"]);
    if (auth.error || !auth.adminUser) return auth.error;
    const detail = await getAdminUserDetail((await params).userId);
    if (!detail.profile.email) return NextResponse.json({ success: false, error: "User has no email address." }, { status: 400 });
    await sendUserPasswordReset(detail.profile.email);
    await logAdminAuditEvent({
      actor: auth.adminUser,
      targetUserId: detail.profile.id,
      targetEmail: detail.profile.email,
      action: "password_reset_sent",
      entityType: "user",
      summary: "Admin sent a password reset email",
      request: req,
    });
    return NextResponse.json({ success: true, message: "Password reset email sent." });
  } catch {
    return NextResponse.json({ success: false, action: "admin_user_password_reset", error: "Could not send password reset." }, { status: 400 });
  }
}
