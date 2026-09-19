import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { applyBusinessStandardProfile } from "@/lib/microsoft-365/intune";

export async function POST(request: NextRequest) {
  const admin = await requireAdminRole(["superadmin"]);

  try {
    await applyBusinessStandardProfile(admin.user_id);
    revalidatePath("/admin/dashboard/security/devices");
    return NextResponse.redirect(
      new URL("/admin/dashboard/security/devices?baseline=applied", request.url),
      303,
    );
  } catch (error) {
    console.error("Intune Business Standard baseline failed", error);
    return NextResponse.redirect(
      new URL("/admin/dashboard/security/devices?baseline=failed", request.url),
      303,
    );
  }
}
