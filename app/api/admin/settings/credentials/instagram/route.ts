import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-api-auth";
import {
  createPlatformInstagramState,
  platformInstagramAuthorizeUrl,
} from "@/lib/marketing/platform-instagram-oauth";

export const dynamic = "force-dynamic";

function baseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.theouthaven.com";
}

function credentialsRedirect(message: string) {
  const url = new URL("/admin/dashboard/credentials", baseUrl());
  url.searchParams.set("instagram_error", message);
  return NextResponse.redirect(url);
}

export async function GET() {
  const { error, adminUser } = await requireSuperAdmin();
  if (error || !adminUser) return error || credentialsRedirect("Superadmin access is required.");

  try {
    const state = createPlatformInstagramState(adminUser.user_id);
    return NextResponse.redirect(await platformInstagramAuthorizeUrl(state));
  } catch (caught) {
    console.error("PLATFORM_INSTAGRAM_OAUTH_START_FAILED", caught);
    return credentialsRedirect(caught instanceof Error ? caught.message : "Instagram connection could not be started.");
  }
}
