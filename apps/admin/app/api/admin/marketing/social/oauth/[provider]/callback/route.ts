import { NextResponse } from "next/server";
import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { completeSocialOauth, verifySocialOauthState, type SocialProvider } from "@/lib/marketing/social-oauth";

export const dynamic = "force-dynamic";

function providerValue(value: string): SocialProvider | null {
  return ["instagram", "facebook", "tiktok", "youtube"].includes(value) ? value as SocialProvider : null;
}

function redirectWith(params: Record<string, string>) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.theouthaven.com";
  const url = new URL("/admin/dashboard/marketing/social-accounts", base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(req: Request, context: { params: Promise<{ provider: string }> }) {
  const adminUser = await getCurrentAdminOrNull();
  if (!adminUser) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_PAGE_ACCESS.marketingSocialAccounts.includes(adminUser.role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  if (!adminUser) return redirectWith({ error: "Unauthorized" });

  const { provider: rawProvider } = await context.params;
  const provider = providerValue(rawProvider);
  if (!provider) return redirectWith({ error: "Unsupported social provider" });

  const url = new URL(req.url);
  const providerError = url.searchParams.get("error") || url.searchParams.get("error_description");
  if (providerError) return redirectWith({ error: providerError });
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state) return redirectWith({ error: "OAuth callback was missing code/state." });

  try {
    const verified = verifySocialOauthState(state, provider);
    if (verified.userId !== adminUser.user_id) throw new Error("OAuth session user mismatch.");
    await completeSocialOauth(provider, code, adminUser.user_id);
    return redirectWith({ connected: provider });
  } catch (error) {
    console.error("Social OAuth callback failed", { provider, error });
    return redirectWith({ error: error instanceof Error ? error.message : "Social OAuth connection failed." });
  }
}
