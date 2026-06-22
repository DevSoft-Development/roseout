import { NextResponse } from "next/server";
import { getAdminUserDetail, sendUserPasswordReset } from "@/lib/admin-users";
import { requireSuperAdmin } from "@/lib/admin-api-auth";
import { logAdminAuditEvent } from "@/lib/admin-audit-log";
export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    const actor = auth.adminUser;
    const d = await getAdminUserDetail((await params).userId);
    if (!d.profile.email) return NextResponse.json({ success: false, error: "User has no email address." }, { status: 400 });
    await sendUserPasswordReset(d.profile.email);
    await logAdminAuditEvent({ actor, targetUserId: d.profile.id, targetEmail: d.profile.email, action: "password_reset_sent", entityType: "user", summary: "Admin sent a password reset email", request: req });
    return NextResponse.json({ success: true, message: "Password reset email sent." });
  } catch { return NextResponse.json({ success: false, action: "admin_user_password_reset", error: "Could not send password reset." }, { status: 400 }); }
}
