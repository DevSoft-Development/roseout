import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-api-auth";
import { changeAdminRole } from "@/lib/admin-system";
import { ADMIN_ROLES, type AdminRole } from "@/lib/users/roles";

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    const { role } = await req.json();
    if (!(ADMIN_ROLES as readonly string[]).includes(String(role))) {
      return NextResponse.json({ success: false, error: "Invalid role." }, { status: 400 });
    }
    const updated = await changeAdminRole({
      targetUserId: (await params).userId,
      role: role as AdminRole,
      actor: auth.adminUser,
      request: req,
    });
    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Role update failed." }, { status: 400 });
  }
}
