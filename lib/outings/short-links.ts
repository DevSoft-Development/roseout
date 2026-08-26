import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{8,20}$/;
const DEFAULT_SHORT_LINK_BASE_URL = "https://outhvn.com";

export function normalizeShortCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return SHORT_CODE_PATTERN.test(code) ? code : null;
}

export function getShortLinkBaseUrl() {
  const configured = String(process.env.SHORT_LINK_BASE_URL || "").trim();
  return (configured || DEFAULT_SHORT_LINK_BASE_URL).replace(/\/$/, "");
}

export function buildShortLinkUrl(code: string) {
  return `${getShortLinkBaseUrl()}/${code}`;
}

export function normalizeShortLinkDestination(value: unknown) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function allocateShortCode(supabaseAdmin: SupabaseClient) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomBytes(8).toString("base64url").slice(0, 10);

    const { data: registered, error: registeredError } = await supabaseAdmin
      .from("short_links")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (registeredError) throw registeredError;
    if (registered) continue;

    const { data: outing, error: outingError } = await supabaseAdmin
      .from("outings")
      .select("id")
      .eq("metadata->>short_code", code)
      .maybeSingle();
    if (outingError) throw outingError;
    if (!outing) return code;
  }

  throw new Error("Unable to allocate a unique short link code.");
}
