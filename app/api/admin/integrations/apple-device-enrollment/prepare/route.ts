import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { assignAppleDevicesToMdmServer, getAppleDeviceActivity, resolveAppleIntuneMdmServer } from "@/lib/apple-business/api";
import { syncIntuneAppleEnrollment } from "@/lib/microsoft-365/intune";

const RETURN_PATH = "/admin/dashboard/security/apple-devices";

async function waitForAppleAssignment(activityId: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const activity = await getAppleDeviceActivity(activityId);
    const status = (activity.attributes?.status || "").toUpperCase();
    if (["COMPLETED", "SUCCEEDED", "SUCCESS"].includes(status)) return activity;
    if (["FAILED", "ERROR"].includes(status)) throw new Error(`APPLE_DEVICE_ASSIGNMENT_${status}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.security);
  const formData = await request.formData();
  const deviceId = String(formData.get("device_id") || "").trim();
  const action = String(formData.get("action") || "prepare").trim();

  if (!deviceId && action !== "sync-intune") {
    return NextResponse.json({ error: "Device is required" }, { status: 400 });
  }

  try {
    let activityId = "";
    if (action === "prepare") {
      const mdmServer = await resolveAppleIntuneMdmServer();
      if (!mdmServer) throw new Error("APPLE_INTUNE_MDM_SERVER_NOT_FOUND");
      const activity = await assignAppleDevicesToMdmServer([deviceId], mdmServer.id);
      activityId = activity.id;
      await waitForAppleAssignment(activityId);
    } else if (action !== "sync-intune") {
      return NextResponse.json({ error: "Invalid enrollment action" }, { status: 400 });
    }

    await syncIntuneAppleEnrollment(admin.user_id);
    revalidatePath(RETURN_PATH);
    revalidatePath("/admin/dashboard/security/devices");

    const url = new URL(RETURN_PATH, request.url);
    url.searchParams.set("status", action === "prepare" ? "prepared" : "synced");
    if (activityId) url.searchParams.set("activity", activityId);
    return NextResponse.redirect(url, 303);
  } catch (error) {
    console.error("Apple device enrollment preparation failed", error);
    const url = new URL(RETURN_PATH, request.url);
    url.searchParams.set("status", "failed");
    return NextResponse.redirect(url, 303);
  }
}
