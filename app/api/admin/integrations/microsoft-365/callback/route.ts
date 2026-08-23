import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/admin-auth";
import { encryptMicrosoftToken } from "@/lib/microsoft-365/crypto";
import { microsoftGraphFetch } from "@/lib/microsoft-365/graph";
import { exchangeMicrosoft365Code } from "@/lib/microsoft-365/oauth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type GraphMe = { id: string; displayName?: string | null; mail?: string | null; userPrincipalName?: string | null };

function redirectWith(request: NextRequest, key: string, value: string) {
  const url = new URL("/admin/dashboard/settings/microsoft-365", request.url);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const errorDescription = request.nextUrl.searchParams.get("error_description");
  if (error) return redirectWith(request, "error", errorDescription || error);
  if (!code || !state) return redirectWith(request, "error", "Missing Microsoft authorization response.");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("toh_m365_state")?.value;
  const verifier = cookieStore.get("toh_m365_pkce")?.value;
  if (!expectedState || expectedState !== state || !verifier) {
    return redirectWith(request, "error", "Microsoft authorization state expired. Please reconnect.");
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
    const email = (me.mail || me.userPrincipalName || admin.email || "").trim().toLowerCase();
    if (!me.id || !email) throw new Error("Microsoft account identity is incomplete.");

    const { error: connectionError } = await supabaseAdmin.from("microsoft_365_connections").update({
      microsoft_user_id: me.id,
      email,
      display_name: me.displayName || null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", admin.user_id);
    if (connectionError) throw connectionError;

    await supabaseAdmin.from("microsoft_365_sync_preferences").upsert({ user_id: admin.user_id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    const response = redirectWith(request, "connected", "1");
    response.cookies.delete("toh_m365_state");
    response.cookies.delete("toh_m365_pkce");
    return response;
  } catch (caught) {
    await supabaseAdmin.from("microsoft_365_connections").update({
      status: "error",
      last_error: caught instanceof Error ? caught.message.slice(0, 1000) : "Microsoft connection failed",
      updated_at: new Date().toISOString(),
    }).eq("user_id", admin.user_id);
    return redirectWith(request, "error", caught instanceof Error ? caught.message : "Microsoft connection failed");
  }
}
