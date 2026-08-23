import "server-only";

import { getMicrosoft365Config } from "./config";

export type MicrosoftTokenResponse = {
  token_type: string;
  scope?: string;
  expires_in: number;
  ext_expires_in?: number;
  access_token: string;
  refresh_token?: string;
  id_token?: string;
};

async function postToken(params: URLSearchParams): Promise<MicrosoftTokenResponse> {
  const { tokenUrl } = getMicrosoft365Config();
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    const description = typeof payload?.error_description === "string" ? payload.error_description : "Microsoft token exchange failed";
    throw new Error(`M365_TOKEN_ERROR:${description}`);
  }
  return payload as MicrosoftTokenResponse;
}

export async function exchangeMicrosoft365Code(code: string, codeVerifier: string) {
  const config = getMicrosoft365Config();
  return postToken(new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
    scope: config.scopes.join(" "),
  }));
}

export async function refreshMicrosoft365Token(refreshToken: string) {
  const config = getMicrosoft365Config();
  return postToken(new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    redirect_uri: config.redirectUri,
    grant_type: "refresh_token",
    scope: config.scopes.join(" "),
  }));
}
