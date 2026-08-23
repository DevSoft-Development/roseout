import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/admin-auth";
import { sanitizeIntendedPath } from "@/lib/auth-redirect";
import { encryptMicrosoftToken } from "@/lib/microsoft-365/crypto";
import { microsoftGraphFetch } from "@/lib/microsoft-365/graph";
import { exchangeMicrosoft365Code } from "@/lib/microsoft-365/oauth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type GraphMe = { id: string; displayName?: string | null; mail?: string | null; userPrincipalName?: string | null };

function decodeNext(value: string | undefined) {
  if (!value) return null;
  try {
    return sanitizeIntendedPath(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function clearFlowCookies(response: NextResponse) {
  response.cookies.delete("toh_m365_state");
  response.cookies.delete("toh_m365_pkce");
  response.cookies.delete("toh_m365_mode");
  response.cookies.delete("toh_m365_next");
  return response;
}

function redirectWith(request: NextRequest, key: string, value: string) {
  const url = new URL("/admin/dashboard/settings/microsoft-365", request.url);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

function redirectToNext(request: NextRequest, next: string, connected = false) {
  const url = new URL(next, request.url);
  if (connected && next === "/admin/dashboard/settings/microsoft-365") {
    url.searchParams.set("connected", "1");
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const errorDescription = request.nextUrl.searchParams.get("error_description");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("toh_m365_state")?.value;
  const verifier = cookieStore.get("toh_m365_pkce")?.value;
  const silent = cookieStore.get("toh_m365_mode")?.value === "silent";
  const requestedNext = decodeNext(cookieStore.get("toh_m365_next")?.value);
  const next = requestedNext?.startsWith("/admin")
    ? requestedNext
    : "/admin/dashboard/settings/microsoft-365";

  if (!state || !expectedState || expectedState !== state) {
    return clearFlowCookies(redirectWith(request, "error", "Microsoft authorization state expired. Please reconnect."));
  }

  if (error) {
    if (silent && ["interaction_required", "login_required", "consent_required", "account_selection_required"].includes(error)) {
      return clearFlowCookies(redirectToNext(request, next));
    }
    return clearFlowCookies(redirectWith(request, "error", errorDescription || error));
  }

  if (!code || !verifier) {
    return clearFlowCookies(redirectWith(request, "error", "Missing Microsoft authorization response."));
  }

  try {
    const token = await exchangeMicrosoft365Code(code, verifier);
    if (!token.refresh_token) throw new Error("Microsoft did not return an offline refresh token.");

    // Store a short-lived encrypted access token first so the Graph helper can load /me.
    const expiresAt = new Date(Date.now() + Math.max(60, token.expires_in - 120) * 1000).toISOString();
    const provisional = {
      user_id: admin.user_id,
      tenant_id: process.env.M365_TENANT_ID!,
      microsoft_user_id: admin.user_id,
      email: admin.email || "pending@theouthaven.com",
      granted_scopes: (token.scope || "").split(" ").filter(Boolean),
      access_token_encrypted: encryptMicrosoftToken(token.access_token),
      refresh_token_encrypted: encryptMicrosoftToken(token.refresh_token),
      access_token_expires_at: expiresAt,
      status: "active",
      last_error: null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error: provisionalError } = await supabaseAdmin.from("microsoft_365_connections").upsert(provisional, { onConflict: "user_id" });
    if (provisionalError) throw provisionalError;

    const me = await microsoftGraphFetch<GraphMe>(admin.user_id, "/me?$select=id,displayName,mail,userPrincipalName");
    const email = (me.mail || me.userPrincipalName || "").trim().toLowerCase();
    const adminEmail = (admin.email || "").trim().toLowerCase();
    if (!me.id || !email) throw new Error("Microsoft account identity is incomplete.");
    if (adminEmail && email !== adminEmail) {
      await supabaseAdmin.from("microsoft_365_connections").delete().eq("user_id", admin.user_id);
      throw new Error("The Microsoft 365 account must match the signed-in TheOutHaven administrator.");
    }

    const { error: connectionError } = await supabaseAdmin.from("microsoft_365_connections").update({
      microsoft_user_id: me.id,
      email,
      display_name: me.displayName || null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", admin.user_id);
    if (connectionError) throw connectionError;

    await supabaseAdmin.from("microsoft_365_sync_preferences").upsert({ user_id: admin.user_id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    return clearFlowCookies(redirectToNext(request, next, true));
  } catch (caught) {
    await supabaseAdmin.from("microsoft_365_connections").update({
      status: "error",
      last_error: caught instanceof Error ? caught.message.slice(0, 1000) : "Microsoft connection failed",
      updated_at: new Date().toISOString(),
    }).eq("user_id", admin.user_id);

    if (silent) return clearFlowCookies(redirectToNext(request, next));
    return clearFlowCookies(redirectWith(request, "error", caught instanceof Error ? caught.message : "Microsoft connection failed"));
  }
}
