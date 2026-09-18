import { NextResponse } from "next/server";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { setAdminAccessState } from "@/lib/security";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const admin = await requireAdminRole(["superadmin"]);
    const body = await request.json();

    if (typeof body.disabled !== "boolean") {
      return NextResponse.json(
        { success: false, error: "disabled must be a boolean." },
        { status: 400 },
      );
    }

    const state = await setAdminAccessState({
      targetUserId: (await params).userId,
      disabled: body.disabled,
      actor: admin,
      request,
    });

    return NextResponse.json({ success: true, state });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Security update failed.",
      },
      { status: 400 },
    );
  }
}
