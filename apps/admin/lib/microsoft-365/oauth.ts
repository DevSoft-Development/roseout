import "server-only";

import {
  exchangeMicrosoftTokenViaIntegrationApi,
  type MicrosoftTokenResponse,
} from "./integration-api";
import { getMicrosoft365Config } from "./config";

export type { MicrosoftTokenResponse };

export async function exchangeMicrosoft365Code(
  code: string,
  codeVerifier: string,
  redirectUri?: string | null,
) {
  const config = await getMicrosoft365Config({ redirectUri });
  return exchangeMicrosoftTokenViaIntegrationApi({
    grantType: "authorization_code",
    code,
    codeVerifier,
    redirectUri: config.redirectUri,
    scope: config.scopes.join(" "),
  });
}

export async function refreshMicrosoft365Token(refreshToken: string) {
  const config = await getMicrosoft365Config();
  return exchangeMicrosoftTokenViaIntegrationApi({
    grantType: "refresh_token",
    refreshToken,
    redirectUri: config.redirectUri,
    scope: config.scopes.join(" "),
  });
}
