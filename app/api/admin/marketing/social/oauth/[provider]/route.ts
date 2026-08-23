import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { createSocialOauthState, socialAuthorizeUrl, socialOauthConfigured, socialOauthRedirectUri, type SocialProvider } from "@/lib/marketing/social-oauth";

export const dynamic = "force-dynamic";

function providerValue(value: string): SocialProvider | null {
  return ["instagram", "facebook", "tiktok", "youtube"].includes(value) ? value as SocialProvider : null;
}

function redirectError(message: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.theouthaven.com";
  return NextResponse.redirect(new URL(`/admin/dashboard/marketing/social-accounts?error=${encodeURIComponent(message)}`, base));
}

function metaBusinessLoginUrl(provider: "instagram" | "facebook", state: string) {
  const appId = process.env.META_APP_ID;
  const version = process.env.META_GRAPH_VERSION;
  const configId = process.env.META_LOGIN_CONFIGURATION_ID;
  if (!appId || !version || !configId) return null;

  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", socialOauthRedirectUri(provider));
  url.searchParams.set("state", state);
  url.searchParams.set("config_id", configId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("override_default_response_type", "true");
  return url.toString();
}

export async function GET(_req: Request, context: { params: Promise<{ provider: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingSocialAccounts);
  if (auth.error) return auth.error;
  if (!auth.adminUser) return redirectError("Unauthorized social account connection attempt.");

  const { provider: rawProvider } = await context.params;
  const provider = providerValue(rawProvider);
  if (!provider) return redirectError("Unsupported social provider.");
  if (!socialOauthConfigured(provider)) {
    return redirectError(`${provider} OAuth is not fully configured. Check provider credentials and the social OAuth security secrets in Vercel.`);
  }

  try {
    const state = createSocialOauthState(provider, auth.adminUser.user_id);
    if (provider === "instagram" || provider === "facebook") {
      const businessLoginUrl = metaBusinessLoginUrl(provider, state);
      if (!businessLoginUrl) return redirectError("Meta Business Login configuration is incomplete.");
      return NextResponse.redirect(businessLoginUrl);
    }

    return NextResponse.redirect(socialAuthorizeUrl(provider, state));
  } catch (error) {
    console.error("Social OAuth start failed", { provider, error });
    return redirectError(error instanceof Error ? error.message : "Social OAuth could not be started.");
  }
}
