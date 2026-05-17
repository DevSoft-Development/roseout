import crypto from "crypto";
import QRCode from "qrcode";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type ClaimLocationType = "restaurant" | "activity" | "location";

type ClaimSourceTable = "restaurants" | "activities" | "locations";

type ClaimFieldRow = {
  id?: string | number;
  source_table?: string | null;
  source_id?: string | number | null;
  claim_code?: string | null;
  claim_token?: string | null;
  claim_url?: string | null;
  claim_qr_url?: string | null;
  qr_link?: string | null;
  qr_code_data_url?: string | null;
};

const CLAIM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CLAIM_CODE_LENGTH = 6;

export function getClaimSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://theouthaven.vercel.app"
  ).replace(/\/$/, "");
}

export function generateClaimToken() {
  return crypto.randomUUID();
}

export function generateClaimCode() {
  const bytes = crypto.randomBytes(CLAIM_CODE_LENGTH);
  const suffix = Array.from(bytes, (byte) => CLAIM_CODE_ALPHABET[byte % CLAIM_CODE_ALPHABET.length]).join("");
  return `OH-${suffix}`;
}

export function normalizeClaimCode(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function getClaimUrl(claimToken: string) {
  return `${getClaimSiteUrl()}/location/apply/claim?token=${encodeURIComponent(claimToken)}`;
}

async function generateQrDataUrl(claimUrl: string) {
  return QRCode.toDataURL(claimUrl, {
    margin: 2,
    width: 700,
  });
}

async function isClaimCodeAvailable(code: string, current?: { table: ClaimSourceTable; id: string | number }) {
  const tables: ClaimSourceTable[] = ["locations", "restaurants", "activities"];

  for (const table of tables) {
    let query = supabaseAdmin.from(table).select("id").eq("claim_code", code).limit(1);

    if (current?.table === table) {
      query = query.neq("id", current.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (data && data.length > 0) return false;
  }

  return true;
}

export async function generateUniqueClaimCode(current?: { table: ClaimSourceTable; id: string | number }) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateClaimCode();
    if (await isClaimCodeAvailable(code, current)) return code;
  }

  throw new Error("Could not generate a unique claim code.");
}

export async function createClaimQr(_type: ClaimLocationType = "location") {
  const claimToken = generateClaimToken();
  const claimUrl = getClaimUrl(claimToken);
  const qrCodeDataUrl = await generateQrDataUrl(claimUrl);

  return {
    claim_code: generateClaimCode(),
    claim_token: claimToken,
    claim_url: claimUrl,
    claim_status: "unclaimed",
    qr_link: claimUrl,
    claim_qr_url: qrCodeDataUrl,
    qr_code_data_url: qrCodeDataUrl,
  };
}

export async function ensureClaimFields(
  row: ClaimFieldRow,
  options: { table?: ClaimSourceTable; regenerateCode?: boolean; regenerateToken?: boolean; regenerateQr?: boolean } = {},
) {
  const table = options.table;
  const current = table && row.id ? { table, id: row.id } : undefined;
  const claimCode =
    options.regenerateCode || !row.claim_code
      ? await generateUniqueClaimCode(current)
      : normalizeClaimCode(row.claim_code);
  const claimToken = options.regenerateToken || !row.claim_token ? generateClaimToken() : row.claim_token;
  const claimUrl = options.regenerateToken || !row.claim_url ? getClaimUrl(claimToken) : row.claim_url;
  const needsQr = options.regenerateQr || options.regenerateToken || !row.qr_code_data_url || !row.claim_qr_url;
  const qrCodeDataUrl = needsQr ? await generateQrDataUrl(claimUrl) : row.qr_code_data_url;

  return {
    claim_code: claimCode,
    claim_token: claimToken,
    claim_url: claimUrl,
    qr_link: claimUrl,
    claim_qr_url: qrCodeDataUrl,
    qr_code_data_url: qrCodeDataUrl,
  };
}

export async function syncClaimFieldsToLocations() {
  const sourceTables: Array<"restaurants" | "activities"> = ["restaurants", "activities"];
  let updated = 0;

  for (const table of sourceTables) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("id, claim_code, claim_token, claim_url, claim_qr_url, qr_link, qr_code_data_url");

    if (error) throw error;

    for (const row of data || []) {
      const fields = await ensureClaimFields(row, { table });

      await supabaseAdmin.from(table).update(fields).eq("id", row.id).throwOnError();
      await supabaseAdmin
        .from("locations")
        .update(fields)
        .eq("source_table", table)
        .eq("source_id", String(row.id))
        .throwOnError();
      updated += 1;
    }
  }

  const { data: locationRows, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("id, claim_code, claim_token, claim_url, claim_qr_url, qr_link, qr_code_data_url")
    .or("claim_code.is.null,claim_token.is.null,claim_url.is.null,qr_code_data_url.is.null");

  if (locationError) throw locationError;

  for (const row of locationRows || []) {
    const fields = await ensureClaimFields(row, { table: "locations" });
    await supabaseAdmin.from("locations").update(fields).eq("id", row.id).throwOnError();
    updated += 1;
  }

  return { updated };
}
