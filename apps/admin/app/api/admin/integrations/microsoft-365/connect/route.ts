import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdmin } from "@theouthaven/auth/admin-session";
import { sanitizeIntendedPath } from "@theouthaven/auth/redirect";
import { getMicrosoft365Config } from "@/lib/microsoft-365/config";
import { resolveAdminAuthOrigin } from "@/lib/web-surface-auth-origin";

function base64url(input: Buffer) {
  return input.toString("base64url");
}

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  const requestUrl = new URL(request.url);
  const origin = resolveAdminAuthOrigin(request, requestUrl);
  const redirectUri = new URL(
    "/api/admin/integrations/microsoft-365/callback",
    origin,
  ).toString();

  const silent = request.nextUrl.searchParams.get("silent") === "1";
  const automatic = request.nextUrl.searchParams.get("auto") === "1";
  const requestedNext = sanitizeIntendedPath(
    request.nextUrl.searchParams.get("next"),
  );
  const next = requestedNext?.startsWith("/admin")
    ? requestedNext
    : "/admin/dashboard/settings/microsoft-365";

  let config;
  try {
    config = await getMicrosoft365Config({ redirectUri });
  } catch (caught) {
    const error =
      caught instanceof Error ? caught.message : "M365_CONNECT_CONFIGURATION_FAILED";
    console.error("Microsoft 365 connect configuration failed:", error);
    const fallback = new URL(
      "/admin/dashboard/settings/microsoft-365",
      origin,
    );
    fallback.searchParams.set("error", error);
    return NextResponse.redirect(fallback);
  }

  const state = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(64));
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");

  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  if (silent) {
    url.searchParams.set("prompt", "none");
  } else if (!automatic) {
    url.searchParams.set("prompt", "select_account");
  }

  if (admin.email) {
    url.searchParams.set("login_hint", admin.email);
  }

  const response = NextResponse.redirect(url);
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    maxAge: 600,
    path: "/",
  };

  response.cookies.set("toh_m365_state", state, cookieOptions);
  response.cookies.set("toh_m365_pkce", verifier, cookieOptions);
  response.cookies.set(
    "toh_m365_mode",
    silent ? "silent" : "interactive",
    cookieOptions,
  );
  response.cookies.set(
    "toh_m365_next",
    base64url(Buffer.from(next, "utf8")),
    cookieOptions,
  );

  return response;
}
