import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-api-auth";
import { setAdminAccessState } from "@/lib/admin-system";

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    const body = await req.json();
    if (typeof body.disabled !== "boolean") {
      return NextResponse.json({ success: false, error: "disabled must be a boolean." }, { status: 400 });
    }
    const state = await setAdminAccessState({
      targetUserId: (await params).userId,
      disabled: body.disabled,
      actor: auth.adminUser,
      request: req,
    });
    return NextResponse.json({ success: true, state });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Security update failed." }, { status: 400 });
  }
}
