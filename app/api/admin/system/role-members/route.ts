import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-api-auth";
import { addAdminRoleMember } from "@/lib/admin-system";
import { isAdminRole } from "@/lib/users/roles";

export async function POST(request: Request) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    if (!auth.adminUser) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const email = typeof body.email === "string" ? body.email : "";
    const fullName = typeof body.fullName === "string" ? body.fullName : null;
    const role = typeof body.role === "string" && isAdminRole(body.role) ? body.role : null;
    if (!role) return NextResponse.json({ success: false, error: "Select a valid role." }, { status: 400 });

    const member = await addAdminRoleMember({ email, fullName, role, actor: auth.adminUser, request });
    return NextResponse.json({ success: true, member });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Staff member could not be added." },
      { status: 400 },
    );
  }
}
