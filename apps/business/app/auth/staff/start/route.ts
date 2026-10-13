import { NextRequest, NextResponse } from "next/server";
import { createAdminOAuthSession } from "@theouthaven/auth/server-client";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_BUSINESS_SITE_URL || "https://business.theouthaven.com";
  const { supabase, redirect } = createAdminOAuthSession(request);
  const callback = new URL("/auth/staff/callback", origin);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: { scopes: "email", redirectTo: callback.toString(), skipBrowserRedirect: true },
  });
  if (error || !data?.url) return NextResponse.redirect(new URL("/business/login?error=microsoft", origin));
  return redirect(data.url);
}
