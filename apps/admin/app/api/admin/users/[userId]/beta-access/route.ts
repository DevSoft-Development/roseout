import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { syncUserBetaAccess } from "@/lib/beta/program-access";

const map: Record<string, string> = {
  none: "none",
  invite: "invite",
  approve: "approved",
  active: "active",
  remove: "removed",
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const admin = await getCurrentAdminOrNull();
  if (!admin) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  if (admin.role !== "superadmin") {
    return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  }

  const { userId } = await params;
  const body = await req.json().catch(() => ({}));
  const choice = String(body.status || "");
  const status = map[choice];
  if (!status) {
    return NextResponse.json(
      { success: false, error: "Choose a valid beta access option." },
      { status: 400 },
    );
  }

  try {
    const result = await syncUserBetaAccess({
      userId,
      requestedBetaStatus: status,
      source: "users_admin",
      adminUserId: admin.user_id,
      actor: admin,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unable to update beta access.",
      },
      { status: 500 },
    );
  }
}
