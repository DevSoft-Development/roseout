import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/admin-auth";
import { sanitizeIntendedPath } from "@/lib/auth-redirect";
import { syncMicrosoft365WorkspaceForUser } from "@/lib/microsoft-365/sync-with-crm";

async function requestedReturnPath(request: NextRequest) {
  try {
    const formData = await request.formData();
    const requested = sanitizeIntendedPath(String(formData.get("return_to") || ""));
    if (requested?.startsWith("/admin")) return requested;
  } catch {
    // A manual sync can be posted without a form body. Use the settings page fallback.
  }
  return "/admin/dashboard/settings/microsoft-365";
}

export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  const returnTo = await requestedReturnPath(request);

  try {
    await syncMicrosoft365WorkspaceForUser(admin.user_id);
    const url = new URL(returnTo, request.url);
    url.searchParams.set("synced", "1");
    return NextResponse.redirect(url, 303);
  } catch (error) {
    const url = new URL(returnTo, request.url);
    url.searchParams.set("error", error instanceof Error ? error.message.slice(0, 240) : "Microsoft sync failed");
    return NextResponse.redirect(url, 303);
  }
}
