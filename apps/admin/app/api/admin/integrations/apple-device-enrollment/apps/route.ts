import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import {
  assignIntuneAppleAppToDevices,
  assignIntuneAppleAppToExecutives,
  assignIntuneAppleAppToGroup,
  assignIntuneAppleAppToProfile,
} from "@/lib/microsoft-365/intune";

const RETURN_PATH = "/admin/dashboard/security/apple-devices";

function getRequestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();

  if (host) {
    const proto =
      forwardedProto ||
      (host.includes("localhost") || host.startsWith("0.0.0.0") ? "http" : "https");
    return `${proto}://${host}`;
  }

  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminRole(["superadmin"]);
  const formData = await request.formData();
  const appId = String(formData.get("app_id") || "").trim();
  const action = String(formData.get("action") || "").trim();
  const targetType = String(formData.get("target_type") || "").trim();

  if (!appId || !["available", "install", "remove"].includes(action)) {
    return NextResponse.json({ error: "App and action are required" }, { status: 400 });
  }

  const intent = action === "install" ? "required" : "uninstall";

  try {
    if (targetType === "profile") {
      if (!["available", "remove"].includes(action)) {
        return NextResponse.json({ error: "Invalid profile app action" }, { status: 400 });
      }
      const profile = String(formData.get("profile") || "").trim();
      if (!["standard", "executive"].includes(profile)) {
        return NextResponse.json({ error: "Valid profile is required" }, { status: 400 });
      }
      await assignIntuneAppleAppToProfile(
        admin.user_id,
        appId,
        profile as "standard" | "executive",
        action === "available" ? "available" : "uninstall",
      );
    } else if (targetType === "executive") {
      if (!["available", "remove"].includes(action)) {
        return NextResponse.json({ error: "Invalid executive app action" }, { status: 400 });
      }
      await assignIntuneAppleAppToExecutives(
        admin.user_id,
        appId,
        action === "available" ? "available" : "uninstall",
      );
    } else if (targetType === "group") {
      if (!["install", "remove"].includes(action)) {
        return NextResponse.json({ error: "Invalid group app action" }, { status: 400 });
      }
      const groupId = String(formData.get("group_id") || "").trim();
      if (!groupId) {
        return NextResponse.json({ error: "Group is required" }, { status: 400 });
      }
      await assignIntuneAppleAppToGroup(admin.user_id, appId, groupId, intent);
    } else if (targetType === "devices") {
      const deviceIds = formData
        .getAll("device_ids")
        .map((value) => String(value).trim())
        .filter(Boolean);
      if (!deviceIds.length) {
        return NextResponse.json({ error: "Select at least one device" }, { status: 400 });
      }
      await assignIntuneAppleAppToDevices(admin.user_id, appId, deviceIds, intent);
    } else {
      return NextResponse.json({ error: "Invalid target type" }, { status: 400 });
    }

    revalidatePath(RETURN_PATH);
    revalidatePath("/admin/dashboard/security/devices");

    const url = new URL(RETURN_PATH, getRequestOrigin(request));
    url.searchParams.set("app_status", action === "available" ? "available-requested" : action === "install" ? "install-requested" : "remove-requested");
    return NextResponse.redirect(url, 303);
  } catch (error) {
    console.error("Apple app catalog action failed", error);
    const url = new URL(RETURN_PATH, getRequestOrigin(request));
    url.searchParams.set("app_status", "failed");
    if (error instanceof Error) {
      url.searchParams.set("app_error", error.message.slice(0, 180));
    }
    return NextResponse.redirect(url, 303);
  }
}
