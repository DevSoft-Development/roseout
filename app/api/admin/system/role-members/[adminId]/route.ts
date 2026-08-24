import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-api-auth";
import { changeAdminRoleByAdminId, removeAdminRoleMember } from "@/lib/admin-system";
import { isAdminRole } from "@/lib/users/roles";

export async function PATCH(request: Request, { params }: { params: Promise<{ adminId: string }> }) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    if (!auth.adminUser) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const role = typeof body.role === "string" && isAdminRole(body.role) ? body.role : null;
    if (!role) return NextResponse.json({ success: false, error: "Select a valid role." }, { status: 400 });

    const member = await changeAdminRoleByAdminId({
      adminId: (await params).adminId,
      role,
      actor: auth.adminUser,
      request,
    });
    return NextResponse.json({ success: true, member });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Role assignment could not be updated." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ adminId: string }> }) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    if (!auth.adminUser) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const removed = await removeAdminRoleMember({
      adminId: (await params).adminId,
      actor: auth.adminUser,
      request,
    });
    return NextResponse.json({ success: true, removed });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Staff access could not be removed." },
      { status: 400 },
    );
  }
}
