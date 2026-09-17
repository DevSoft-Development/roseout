import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export function normalizePromoCode(code: string) {
  return code.trim().toUpperCase();
}

export function generatePromoCode(prefix = "OUT", length = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const cleanedPrefix =
    normalizePromoCode(prefix || "OUT")
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 10) || "OUT";

  let suffix = "";
  for (let i = 0; i < length; i += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return `${cleanedPrefix}-${suffix}`;
}

export async function generateUniquePromoCode(prefix = "OUT") {
  const adminDb = getAdminDatabaseClient();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generatePromoCode(prefix, 8);
    const { data, error } = await adminDb
      .from("promo_codes")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;
    if (!data) return code;
  }

  return `${generatePromoCode(prefix, 10)}-${Date.now().toString(36).toUpperCase()}`;
}
