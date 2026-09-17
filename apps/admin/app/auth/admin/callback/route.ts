import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@theouthaven/auth/server-client";
import { normalizeAdminRole } from "@theouthaven/auth/admin-roles";
import { sanitizeIntendedPath } from "@theouthaven/auth/redirect";
import { resolveWebSurfaceAuthOrigin } from "@theouthaven/config/web-surface-origin";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { logAdminAuditEvent } from "@/lib/admin-audit-log";

function redirectToAdminLogin(request: NextRequest, requestUrl: URL, error: string) {
  const url = new URL("/admin/login", resolveWebSurfaceAuthOrigin(request, requestUrl, "admin"));
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
  const origin = resolveWebSurfaceAuthOrigin(request, requestUrl, "admin");
  const code = requestUrl.searchParams.get("code");
  const requestedNext = sanitizeIntendedPath(requestUrl.searchParams.get("next"));
  const next = requestedNext?.startsWith("/admin") ? requestedNext : "/admin/dashboard";

  if (!code) return redirectToAdminLogin(request, requestUrl, "oauth_failed");

  const supabase = await createServerSupabaseClient();
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
  const supabaseAdmin = getAdminDatabaseClient();

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

  const role = normalizeAdminRole(adminUser?.role);
  const authorized =
    !adminLookupError &&
    adminUser?.user_id === user.id &&
    role !== null;

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
    actor: { user_id: user.id, email: normalizedEmail, role },
    action: "admin.microsoft_sign_in_succeeded",
    entityType: "admin_auth",
    entityId: user.id,
    summary: "Administrator signed in with Microsoft Entra ID.",
    metadata: { provider: "azure" },
    request,
  });

  const { data: m365Connection, error: m365ConnectionError } = await supabaseAdmin
    .from("microsoft_365_connections")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (m365ConnectionError) {
    console.error("ADMIN_M365_CONNECTION_LOOKUP_FAILED", m365ConnectionError);
  } else if (m365Connection?.status !== "active") {
    const connectUrl = new URL("/api/admin/integrations/microsoft-365/connect", origin);
    connectUrl.searchParams.set("auto", "1");
    connectUrl.searchParams.set("next", next);
    return NextResponse.redirect(connectUrl);
  }

  return NextResponse.redirect(new URL(next, origin));
}
