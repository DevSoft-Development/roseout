import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{8,20}$/;

export function normalizeShortCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return SHORT_CODE_PATTERN.test(code) ? code : null;
}

export function getShortLinkBaseUrl() {
  const configured = String(process.env.SHORT_LINK_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
  return `${siteUrl}/p`;
}

export function buildShortLinkUrl(code: string) {
  return `${getShortLinkBaseUrl()}/${code}`;
}

export async function allocateShortCode(supabaseAdmin: SupabaseClient) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomBytes(9).toString("base64url").slice(0, 12);
    const { data, error } = await supabaseAdmin
      .from("outings")
      .select("id")
      .eq("metadata->>short_code", code)
      .maybeSingle();

    if (error) throw error;
    if (!data) return code;
  }

  throw new Error("Unable to allocate a unique short link code.");
}
