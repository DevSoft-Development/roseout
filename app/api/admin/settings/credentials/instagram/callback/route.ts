import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-api-auth";
import {
  completePlatformInstagramOauth,
  verifyPlatformInstagramState,
} from "@/lib/marketing/platform-instagram-oauth";

export const dynamic = "force-dynamic";

function baseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.theouthaven.com";
}

function credentialsRedirect(params: Record<string, string>) {
  const url = new URL("/admin/dashboard/credentials", baseUrl());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const stateValue = requestUrl.searchParams.get("state") || "";
  if (!stateValue) return credentialsRedirect({ instagram_error: "Instagram callback was missing the OAuth state." });

  let state;
  try {
    state = verifyPlatformInstagramState(stateValue);
  } catch (caught) {
    return credentialsRedirect({ instagram_error: caught instanceof Error ? caught.message : "Instagram OAuth state was invalid." });
  }

  const providerError = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");
  if (providerError) return credentialsRedirect({ instagram_error: providerError });

  const code = requestUrl.searchParams.get("code") || "";
  if (!code) return credentialsRedirect({ instagram_error: "Instagram did not return an authorization code." });

  const { error, adminUser } = await requireSuperAdmin();
  if (error || !adminUser) return error || credentialsRedirect({ instagram_error: "Superadmin access is required." });
  if (adminUser.user_id !== state.userId) return credentialsRedirect({ instagram_error: "Instagram connection session does not match the signed-in admin." });

  try {
    const connection = await completePlatformInstagramOauth(code, adminUser.user_id);
    return credentialsRedirect({ instagram_connected: "1", instagram_account: connection.username || "Instagram" });
  } catch (caught) {
    console.error("PLATFORM_INSTAGRAM_OAUTH_CALLBACK_FAILED", caught);
    return credentialsRedirect({ instagram_error: caught instanceof Error ? caught.message : "Instagram connection failed." });
  }
}
