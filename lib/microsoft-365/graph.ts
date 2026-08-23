import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { decryptMicrosoftToken, encryptMicrosoftToken } from "./crypto";
import { refreshMicrosoft365Token } from "./oauth";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

type ConnectionRow = {
  user_id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  access_token_expires_at: string | null;
  status: string;
};

async function getConnection(userId: string): Promise<ConnectionRow> {
  const { data, error } = await supabaseAdmin
    .from("microsoft_365_connections")
    .select("user_id,access_token_encrypted,refresh_token_encrypted,access_token_expires_at,status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "active") throw new Error("M365_NOT_CONNECTED");
  return data as ConnectionRow;
}

async function refreshAccessToken(userId: string, connection: ConnectionRow): Promise<string> {
  if (!connection.refresh_token_encrypted) throw new Error("M365_REAUTHORIZATION_REQUIRED");
  try {
    const currentRefreshToken = decryptMicrosoftToken(connection.refresh_token_encrypted);
    const token = await refreshMicrosoft365Token(currentRefreshToken);
    const expiresAt = new Date(Date.now() + Math.max(60, token.expires_in - 120) * 1000).toISOString();
    const update: Record<string, unknown> = {
      access_token_encrypted: encryptMicrosoftToken(token.access_token),
      access_token_expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
      last_error: null,
      status: "active",
      updated_at: new Date().toISOString(),
    };
    if (token.refresh_token) update.refresh_token_encrypted = encryptMicrosoftToken(token.refresh_token);
    const { error } = await supabaseAdmin.from("microsoft_365_connections").update(update).eq("user_id", userId);
    if (error) throw error;
    return token.access_token;
  } catch (error) {
    await supabaseAdmin.from("microsoft_365_connections").update({
      status: "reauthorization_required",
      last_error: error instanceof Error ? error.message.slice(0, 1000) : "Token refresh failed",
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    throw error;
  }
}

export async function getMicrosoft365AccessToken(userId: string): Promise<string> {
  const connection = await getConnection(userId);
  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  if (connection.access_token_encrypted && expiresAt > Date.now() + 60_000) {
    return decryptMicrosoftToken(connection.access_token_encrypted);
  }
  return refreshAccessToken(userId, connection);
}

export async function microsoftGraphFetch<T>(userId: string, pathOrUrl: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getMicrosoft365AccessToken(userId);
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH_ROOT}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`M365_GRAPH_${response.status}:${payload.slice(0, 1200)}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
