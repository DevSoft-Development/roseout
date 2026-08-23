import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

function encryptionKey() {
  const secret = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY is not configured.");
  return createHash("sha256").update(secret, "utf8").digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function decrypt(value: string) {
  const raw = Buffer.from(value, "base64url");
  if (raw.length < 29) throw new Error("Invalid encrypted token payload.");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export async function storeSocialConnectionSecrets(input: {
  connectionId: string;
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  scopes?: string[];
  expiresAt?: string | null;
}) {
  const { error } = await supabaseAdmin.from("marketing_social_connection_secrets").upsert({
    connection_id: input.connectionId,
    access_token_ciphertext: encrypt(input.accessToken),
    refresh_token_ciphertext: input.refreshToken ? encrypt(input.refreshToken) : null,
    token_type: input.tokenType || null,
    scopes: input.scopes || [],
    expires_at: input.expiresAt || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function loadSocialConnectionSecrets(connectionId: string) {
  const { data, error } = await supabaseAdmin
    .from("marketing_social_connection_secrets")
    .select("access_token_ciphertext,refresh_token_ciphertext,token_type,scopes,expires_at")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.access_token_ciphertext) throw new Error("Social connection token is missing.");
  return {
    accessToken: decrypt(data.access_token_ciphertext),
    refreshToken: data.refresh_token_ciphertext ? decrypt(data.refresh_token_ciphertext) : null,
    tokenType: data.token_type || null,
    scopes: data.scopes || [],
    expiresAt: data.expires_at || null,
  };
}
