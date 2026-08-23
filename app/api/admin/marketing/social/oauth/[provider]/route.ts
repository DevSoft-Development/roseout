import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { createSocialOauthState, socialAuthorizeUrl, socialOauthConfigured, type SocialProvider } from "@/lib/marketing/social-oauth";

export const dynamic = "force-dynamic";

function providerValue(value: string): SocialProvider | null {
  return ["instagram", "facebook", "tiktok", "youtube"].includes(value) ? value as SocialProvider : null;
}

export async function GET(_req: Request, context: { params: Promise<{ provider: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingSocialAccounts);
  if (auth.error) return auth.error;
  if (!auth.adminUser) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { provider: rawProvider } = await context.params;
  const provider = providerValue(rawProvider);
  if (!provider) return NextResponse.json({ success: false, error: "Unsupported social provider." }, { status: 400 });
  if (!socialOauthConfigured(provider)) {
    return NextResponse.redirect(new URL(`/admin/dashboard/marketing/social-accounts?error=${encodeURIComponent(`${provider} OAuth credentials are not configured`)}`, process.env.NEXT_PUBLIC_SITE_URL || "https://www.theouthaven.com"));
  }

  const state = createSocialOauthState(provider, auth.adminUser.user_id);
  return NextResponse.redirect(socialAuthorizeUrl(provider, state));
}
