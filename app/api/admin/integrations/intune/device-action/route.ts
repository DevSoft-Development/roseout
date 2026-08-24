import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { runIntuneDeviceAction } from "@/lib/microsoft-365/intune";

export async function POST(request: NextRequest) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.security);
  const formData = await request.formData();
  const deviceId = String(formData.get("device_id") || "").trim();
  const action = String(formData.get("action") || "").trim();

  if (!deviceId || action !== "syncDevice") {
    return NextResponse.json({ error: "Invalid device action" }, { status: 400 });
  }

  try {
    await runIntuneDeviceAction(admin.user_id, deviceId, action);
    revalidatePath("/admin/dashboard/security/devices");
    return NextResponse.redirect(new URL("/admin/dashboard/security/devices?sync=queued", request.url), 303);
  } catch (error) {
    console.error("Intune device action failed", error);
    return NextResponse.redirect(new URL("/admin/dashboard/security/devices?sync=failed", request.url), 303);
  }
}
