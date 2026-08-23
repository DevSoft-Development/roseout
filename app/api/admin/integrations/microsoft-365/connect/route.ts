import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/admin-auth";
import { getMicrosoft365Config } from "@/lib/microsoft-365/config";

function base64url(input: Buffer) {
  return input.toString("base64url");
}

export async function GET() {
  await getCurrentAdmin();
  const config = getMicrosoft365Config();
  const state = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(64));
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(url);
  const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };
  response.cookies.set("toh_m365_state", state, cookieOptions);
  response.cookies.set("toh_m365_pkce", verifier, cookieOptions);
  return response;
}
