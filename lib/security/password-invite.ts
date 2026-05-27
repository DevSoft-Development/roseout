import { createPasswordSetupToken, hashPasswordSetupToken } from "@/lib/auth/passwordSetupTokens";

export function generatePasswordInviteToken() {
  const rawToken = createPasswordSetupToken();
  const tokenHash = hashPasswordSetupToken(rawToken);
  return { rawToken, tokenHash };
}

export const hashPasswordInviteToken = hashPasswordSetupToken;
