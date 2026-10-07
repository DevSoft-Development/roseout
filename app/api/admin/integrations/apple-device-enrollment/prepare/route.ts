import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { assignAppleDevicesToMdmServer, getAppleDeviceActivity, listAppleBusinessDevices, resolveAppleIntuneMdmServer } from "@/lib/apple-business/api";
import { applyBusinessStandardProfile, assignIntuneIosEnrollmentProfileToSerial, ensureDefaultIntuneIosEnrollmentProfile, syncIntuneAppleEnrollment } from "@/lib/microsoft-365/intune";

const RETURN_PATH = "/admin/dashboard/security/apple-devices";

function getRequestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();

  if (host) {
    const proto = forwardedProto || (host.includes("localhost") || host.startsWith("0.0.0.0") ? "http" : "https");
    return `${proto}://${host}`;
  }

  return request.nextUrl.origin;
}

async function waitForAppleAssignment(activityId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const activity = await getAppleDeviceActivity(activityId);
    const status = (activity.attributes?.status || "").toUpperCase();
    if (["COMPLETED", "SUCCEEDED", "SUCCESS"].includes(status)) return activity;
    if (["FAILED", "ERROR"].includes(status)) throw new Error(`APPLE_DEVICE_ASSIGNMENT_${status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("APPLE_DEVICE_ASSIGNMENT_TIMEOUT");
}

async function assignEnrollmentProfileWithRetry(
  userId: string,
  depOnboardingSettingId: string,
  enrollmentProfileId: string,
  serialNumber: string,
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      await assignIntuneIosEnrollmentProfileToSerial(
        userId,
        depOnboardingSettingId,
        enrollmentProfileId,
        serialNumber,
      );
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("INTUNE_ADE_PROFILE_ASSIGNMENT_TIMEOUT");
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
    let serialNumber = "";
    if (action === "prepare") {
      const [mdmServer, appleDevices] = await Promise.all([
        resolveAppleIntuneMdmServer(),
        listAppleBusinessDevices(),
      ]);
      if (!mdmServer) throw new Error("APPLE_INTUNE_MDM_SERVER_NOT_FOUND");
      const selectedDevice = appleDevices.find((device) => device.id === deviceId);
      if (!selectedDevice) throw new Error("APPLE_DEVICE_NOT_FOUND");
      serialNumber = selectedDevice.attributes?.serialNumber || selectedDevice.id;

      const activity = await assignAppleDevicesToMdmServer([deviceId], mdmServer.id);
      activityId = activity.id;
      await waitForAppleAssignment(activityId);
    } else if (action !== "sync-intune") {
      return NextResponse.json({ error: "Invalid enrollment action" }, { status: 400 });
    }

    await applyBusinessStandardProfile(admin.user_id);
    const depSetting = await syncIntuneAppleEnrollment(admin.user_id);

    if (action === "prepare") {
      const enrollmentProfile = await ensureDefaultIntuneIosEnrollmentProfile(
        admin.user_id,
        depSetting.id,
      );
      await assignEnrollmentProfileWithRetry(
        admin.user_id,
        depSetting.id,
        enrollmentProfile.id,
        serialNumber,
      );
    }
    revalidatePath(RETURN_PATH);
    revalidatePath("/admin/dashboard/security/devices");

    const url = new URL(RETURN_PATH, getRequestOrigin(request));
    url.searchParams.set("status", action === "prepare" ? "prepared" : "synced");
    if (activityId) url.searchParams.set("activity", activityId);
    return NextResponse.redirect(url, 303);
  } catch (error) {
    console.error("Apple device enrollment preparation failed", error);
    const url = new URL(RETURN_PATH, getRequestOrigin(request));
    url.searchParams.set("status", "failed");
    if (error instanceof Error) url.searchParams.set("error", error.message.slice(0, 180));
    return NextResponse.redirect(url, 303);
  }
}
