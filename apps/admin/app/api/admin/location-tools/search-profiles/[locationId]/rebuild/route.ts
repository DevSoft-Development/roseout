import { NextResponse } from "next/server";

import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { refreshLocationSearchProfile } from "@/lib/search/profile/profileRepository";

async function requireProfileOperator() {
  const admin = await getCurrentAdminOrNull();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!["superadmin", "admin"].includes(admin.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ locationId: string }> },
) {
  const authError = await requireProfileOperator();
  if (authError) return authError;

  try {
    return NextResponse.json({
      profile: await refreshLocationSearchProfile(
        (await params).locationId,
        "admin_rebuild",
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Rebuild failed",
      },
      { status: 500 },
    );
  }
}
