import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-api-auth";
import { saveAdminRolePolicy, resetAdminRolePolicy } from "@/lib/admin-role-policy";
import { ADMIN_ROLES, type AdminRole } from "@/lib/users/roles";
import type { AdminPermissionKey } from "@/lib/admin-permissions";

function parseRole(value: string): AdminRole | null {
  return (ADMIN_ROLES as readonly string[]).includes(value) ? value as AdminRole : null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ role: string }> }) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    const role = parseRole((await params).role);
    if (!role) return NextResponse.json({ success: false, error: "Invalid role." }, { status: 400 });

    const body = await req.json();
    if (!Array.isArray(body.permissions) || typeof body.description !== "string") {
      return NextResponse.json({ success: false, error: "Description and permissions are required." }, { status: 400 });
    }

    const policy = await saveAdminRolePolicy({
      role,
      description: body.description,
      permissions: body.permissions as AdminPermissionKey[],
      actor: auth.adminUser,
      request: req,
    });
    return NextResponse.json({ success: true, policy });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Role policy update failed." },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ role: string }> }) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    const role = parseRole((await params).role);
    if (!role) return NextResponse.json({ success: false, error: "Invalid role." }, { status: 400 });

    const policy = await resetAdminRolePolicy({ role, actor: auth.adminUser, request: req });
    return NextResponse.json({ success: true, policy });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Role policy reset failed." },
      { status: 400 },
    );
  }
}
