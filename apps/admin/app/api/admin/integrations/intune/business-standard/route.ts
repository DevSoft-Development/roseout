import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { resolveAdminAuthOrigin } from "@/lib/web-surface-auth-origin";
import { applyBusinessStandardProfile } from "@/lib/microsoft-365/intune";

export async function POST(request: NextRequest) {
  const admin = await requireAdminRole(["superadmin"]);
  const requestUrl = new URL(request.url);
  const origin = resolveAdminAuthOrigin(request, requestUrl);

  try {
    await applyBusinessStandardProfile(admin.user_id);
    revalidatePath("/admin/dashboard/security/devices");
    return NextResponse.redirect(
      new URL("/admin/dashboard/security/devices?baseline=applied", origin),
      303,
    );
  } catch (error) {
    console.error("Intune Business Standard baseline failed", error);
    return NextResponse.redirect(
      new URL("/admin/dashboard/security/devices?baseline=failed", origin),
      303,
    );
  }
}
