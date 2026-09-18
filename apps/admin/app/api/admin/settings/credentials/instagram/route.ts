import { NextResponse } from "next/server";
import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import {
  createPlatformInstagramState,
  platformInstagramAuthorizeUrl,
} from "@/lib/marketing/platform-instagram-oauth";

export const dynamic = "force-dynamic";

function baseUrl() {
  return process.env.NEXT_PUBLIC_ADMIN_SITE_URL || process.env.ADMIN_SITE_URL || "https://admin.theouthaven.com";
}

function credentialsRedirect(message: string) {
  const url = new URL("/admin/dashboard/credentials", baseUrl());
  url.searchParams.set("instagram_error", message);
  return NextResponse.redirect(url);
}

export async function GET() {
  const adminUser = await getCurrentAdminOrNull();
  if (!adminUser || adminUser.role !== "superadmin") {
    return credentialsRedirect("Superadmin access is required.");
  }

  try {
    const state = createPlatformInstagramState(adminUser.user_id);
    return NextResponse.redirect(await platformInstagramAuthorizeUrl(state));
  } catch (caught) {
    console.error("PLATFORM_INSTAGRAM_OAUTH_START_FAILED", caught);
    return credentialsRedirect(caught instanceof Error ? caught.message : "Instagram connection could not be started.");
  }
}
