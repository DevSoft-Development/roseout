import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdminRole, normalizeRole } from "@/lib/users/roles";
import { sanitizeIntendedPath } from "@/lib/auth-redirect";
import { logAdminAuditEvent } from "@/lib/admin-audit-log";
import { resolveWebSurfaceAuthOrigin } from "@/lib/web-surface-auth-origin";

function redirectToAdminLogin(request: NextRequest, requestUrl: URL, error: string) {
  const url = new URL("/admin/login", resolveWebSurfaceAuthOrigin(request, requestUrl));
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

function isMicrosoftIdentity(user: {
  app_metadata?: Record<string, unknown> | null;
  identities?: Array<{ provider?: string | null }> | null;
}) {
  if (user.app_metadata?.provider === "azure") return true;
  return Boolean(user.identities?.some((identity) => identity.provider === "azure"));
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = resolveWebSurfaceAuthOrigin(request, requestUrl);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = sanitizeIntendedPath(requestUrl.searchParams.get("next"));
  const next = requestedNext?.startsWith("/admin") ? requestedNext : "/admin/dashboard";

  if (!code) return redirectToAdminLogin(request, requestUrl, "oauth_failed");

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("ADMIN_MICROSOFT_OAUTH_EXCHANGE_FAILED", exchangeError);
    return redirectToAdminLogin(request, requestUrl, "oauth_failed");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id || !user.email || !isMicrosoftIdentity(user)) {
    await supabase.auth.signOut().catch(() => undefined);
    return redirectToAdminLogin(request, requestUrl, "invalid_identity");
  }

  const normalizedEmail = user.email.trim().toLowerCase();

  let { data: adminUser, error: adminLookupError } = await supabaseAdmin
    .from("admin_users")
    .select("user_id,email,role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminUser && !adminLookupError) {
    const { data: byEmail, error: emailLookupError } = await supabaseAdmin
      .from("admin_users")
      .select("user_id,email,role")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (emailLookupError) adminLookupError = emailLookupError;
    adminUser = byEmail;

    if (adminUser && !adminUser.user_id) {
      const { error: bindError } = await supabaseAdmin
        .from("admin_users")
        .update({ user_id: user.id })
        .ilike("email", normalizedEmail)
        .is("user_id", null);

      if (bindError) {
        console.error("ADMIN_MICROSOFT_IDENTITY_BIND_FAILED", bindError);
        await supabase.auth.signOut().catch(() => undefined);
        return redirectToAdminLogin(request, requestUrl, "not_authorized");
      }
      adminUser = { ...adminUser, user_id: user.id };
    }
  }

  const normalizedRole = normalizeRole(adminUser?.role);
  const authorized =
    !adminLookupError &&
    adminUser?.user_id === user.id &&
    typeof normalizedRole === "string" &&
    isAdminRole(normalizedRole);

  if (!authorized) {
    await logAdminAuditEvent({
      actor: { user_id: user.id, email: normalizedEmail, role: null },
      action: "admin.microsoft_sign_in_denied",
      entityType: "admin_auth",
      entityId: user.id,
      summary: "Microsoft identity authenticated but is not authorized for administration.",
      metadata: { provider: "azure" },
      request,
    });
    await supabase.auth.signOut().catch(() => undefined);
    return redirectToAdminLogin(request, requestUrl, "not_authorized");
  }

  await logAdminAuditEvent({
    actor: { user_id: user.id, email: normalizedEmail, role: normalizedRole },
    action: "admin.microsoft_sign_in_succeeded",
    entityType: "admin_auth",
    entityId: user.id,
    summary: "Administrator signed in with Microsoft Entra ID.",
    metadata: { provider: "azure" },
    request,
  });

  // Microsoft Entra authentication and the active Admin role are the login gate.
  // The separate Microsoft 365 Graph connection powers optional Admin integrations
  // and must never block access to the Admin dashboard.
  return NextResponse.redirect(new URL(next, origin));
}
