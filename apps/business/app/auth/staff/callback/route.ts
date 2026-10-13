import { NextRequest } from "next/server";
import { createAdminOAuthSession } from "@theouthaven/auth/server-client";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { normalizeAdminRole } from "@theouthaven/auth/admin-roles";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_BUSINESS_SITE_URL || "https://business.theouthaven.com";
  const { supabase, redirect } = createAdminOAuthSession(request);
  const fail = async () => {
    await supabase.auth.signOut().catch(() => undefined);
    return redirect(new URL("/business/login?error=staff_not_authorized", origin));
  };
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return fail();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail();
  const { data: { user } } = await supabase.auth.getUser();
  const microsoft = user?.app_metadata?.provider === "azure" ||
    user?.identities?.some(identity => identity.provider === "azure");
  if (!user?.id || !microsoft) return fail();
  const { data: staff, error: roleError } = await getAdminDatabaseClient()
    .from("admin_users").select("role,user_id").eq("user_id", user.id).maybeSingle();
  // Never grant access based on a matching email, an OAuth assertion alone,
  // or user-editable profile metadata.
  if (roleError || staff?.user_id !== user.id || !normalizeAdminRole(staff.role)) return fail();
  return redirect(new URL("/locations/dashboard", origin));
}
