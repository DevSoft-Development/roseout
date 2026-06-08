import crypto from "crypto";
import QRCode from "qrcode";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildClaimUrlFromCode, normalizeClaimCode } from "@/lib/claimQr";
import { buildSiteUrl, getCanonicalAppUrl } from "@/lib/site-url";

export type ClaimLocationType = "restaurant" | "activity" | "location";
export type ClaimSourceTable = "restaurants" | "activities" | "locations";

type ClaimFieldRow = {
  id?: string | number;
  source_table?: string | null;
  source_id?: string | number | null;
  claim_status?: string | null;
  claim_code?: string | null;
  claim_token?: string | null;
  claim_url?: string | null;
  claim_qr_url?: string | null;
  qr_link?: string | null;
  qr_code_data_url?: string | null;
};

const CLAIM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CLAIM_CODE_LENGTH = 8;

const missing = (value: unknown) => !String(value ?? "").trim();

function isLegacyClaimValue(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();

  if (!raw) return false;

  return (
    raw.includes("roseout.com") ||
    raw.includes("www.roseout.com") ||
    raw.includes("roseout.vercel.app") ||
    raw.includes("www.roseout.vercel.app") ||
    raw.includes("theouthaven.vercel.app") ||
    raw.includes("/location/apply/claim") ||
    raw.includes("/claim/")
  );
}

function needsClaimRepair(row: ClaimFieldRow, options: { forceCanonicalUrl?: boolean; regenerateQr?: boolean } = {}) {
  return (
    options.forceCanonicalUrl ||
    options.regenerateQr ||
    missing(row.claim_code) ||
    missing(row.claim_token) ||
    missing(row.claim_url) ||
    missing(row.claim_qr_url) ||
    missing(row.qr_link) ||
    missing(row.qr_code_data_url) ||
    missing(row.claim_status) ||
    isLegacyClaimValue(row.claim_url) ||
    isLegacyClaimValue(row.qr_link)
  );
}

export function getClaimSiteUrl() {
  return getCanonicalAppUrl().replace(/\/$/, "");
}

export function generateClaimToken() {
  return crypto.randomUUID();
}

export function generateClaimCode() {
  const raw = Array.from(
    crypto.randomBytes(CLAIM_CODE_LENGTH),
    (b) => CLAIM_CODE_ALPHABET[b % CLAIM_CODE_ALPHABET.length],
  ).join("");

  return `TOH-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function getClaimUrl(claimCode: string) {
  return buildSiteUrl(buildClaimUrlFromCode(claimCode));
}

async function generateQrDataUrl(claimUrl: string) {
  return QRCode.toDataURL(claimUrl, { margin: 2, width: 700 });
}

async function isClaimCodeAvailable(
  code: string,
  current?: { table: ClaimSourceTable; id: string | number },
) {
  for (const table of ["locations", "restaurants", "activities"] as ClaimSourceTable[]) {
    let query = supabaseAdmin.from(table).select("id").eq("claim_code", code).limit(1);

    if (current?.table === table) {
      query = query.neq("id", current.id);
    }

    const { data, error } = await query;

    if (error) throw error;
    if (data?.length) return false;
  }

  return true;
}

export async function generateUniqueClaimCode(
  current?: { table: ClaimSourceTable; id: string | number },
) {
  for (let i = 0; i < 20; i += 1) {
    const code = generateClaimCode();

    if (await isClaimCodeAvailable(code, current)) {
      return code;
    }
  }

  throw new Error("Could not generate a unique claim code.");
}

export async function createClaimQr(_type: ClaimLocationType = "location") {
  const claim_code = generateClaimCode();
  const claim_token = generateClaimToken();
  const claim_url = getClaimUrl(claim_code);
  const qrCodeDataUrl = await generateQrDataUrl(claim_url);

  return {
    claim_code,
    claim_token,
    claim_url,
    claim_status: "unclaimed",
    qr_link: claim_url,
    claim_qr_url: qrCodeDataUrl,
    qr_code_data_url: qrCodeDataUrl,
  };
}

export async function ensureClaimFields(
  row: ClaimFieldRow,
  options: {
    table?: ClaimSourceTable;
    regenerateCode?: boolean;
    regenerateToken?: boolean;
    regenerateQr?: boolean;
    forceCanonicalUrl?: boolean;
  } = {},
) {
  const current =
    options.table && row.id ? { table: options.table, id: row.id } : undefined;

  const existingCode = normalizeClaimCode(String(row.claim_code || ""));

  const claim_code =
    options.regenerateCode || missing(existingCode)
      ? await generateUniqueClaimCode(current)
      : existingCode;

  const claim_token =
    options.regenerateToken || missing(row.claim_token)
      ? generateClaimToken()
      : String(row.claim_token);

  const canonicalClaimUrl = getClaimUrl(claim_code);

  const claimUrlIsLegacy = isLegacyClaimValue(row.claim_url);
  const qrLinkIsLegacy = isLegacyClaimValue(row.qr_link);

  const shouldRepairUrl =
    options.forceCanonicalUrl ||
    options.regenerateCode ||
    options.regenerateToken ||
    missing(row.claim_url) ||
    claimUrlIsLegacy;

  const claim_url = shouldRepairUrl ? canonicalClaimUrl : String(row.claim_url);

  const shouldRegenerateQr =
    options.regenerateQr ||
    shouldRepairUrl ||
    qrLinkIsLegacy ||
    missing(row.qr_code_data_url) ||
    missing(row.claim_qr_url);

  const qr_code_data_url = shouldRegenerateQr
    ? await generateQrDataUrl(claim_url)
    : String(row.qr_code_data_url || row.claim_qr_url);

  return {
    claim_code,
    claim_token,
    claim_url,
    claim_status: row.claim_status || "unclaimed",
    qr_link:
      shouldRepairUrl || qrLinkIsLegacy || missing(row.qr_link)
        ? claim_url
        : String(row.qr_link),
    claim_qr_url:
      shouldRegenerateQr || missing(row.claim_qr_url)
        ? qr_code_data_url
        : String(row.claim_qr_url),
    qr_code_data_url,
  };
}

export async function ensureClaimFieldsForTable(
  table: ClaimSourceTable,
  limit = 5000,
  options: { forceCanonicalUrl?: boolean; regenerateQr?: boolean } = {},
) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(
      "id, claim_status, claim_code, claim_token, claim_url, claim_qr_url, qr_link, qr_code_data_url",
    )
    .order("id", { ascending: true })
    .limit(limit);

  if (error) throw error;

  let updated = 0;
  let repairedLegacyUrls = 0;
  let regeneratedQrs = 0;
  const errors: Array<{ id: string | number; error: string }> = [];

  for (const row of data || []) {
    try {
      const hadLegacyUrl =
        isLegacyClaimValue(row.claim_url) || isLegacyClaimValue(row.qr_link);

      if (!needsClaimRepair(row, options)) continue;

      const fields = await ensureClaimFields(row, {
        table,
        forceCanonicalUrl: options.forceCanonicalUrl || hadLegacyUrl,
        regenerateQr: options.regenerateQr || hadLegacyUrl,
      });

      await supabaseAdmin.from(table).update(fields).eq("id", row.id).throwOnError();

      updated += 1;
      if (hadLegacyUrl) repairedLegacyUrls += 1;
      if (options.regenerateQr || hadLegacyUrl) regeneratedQrs += 1;
    } catch (error) {
      errors.push({
        id: row.id!,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    table,
    scanned: data?.length || 0,
    updated,
    repairedLegacyUrls,
    regeneratedQrs,
    errors,
  };
}

export async function ensureClaimFieldsForTableBatch(
  table: ClaimSourceTable,
  options: {
    offset?: number;
    batchSize?: number;
    forceCanonicalUrl?: boolean;
    regenerateQr?: boolean;
  } = {},
) {
  const batchSize = Math.min(Math.max(Number(options.batchSize || 100), 1), 250);
  const offset = Math.max(Number(options.offset || 0), 0);
  const from = offset;
  const to = offset + batchSize - 1;

  const { data, error, count } = await supabaseAdmin
    .from(table)
    .select(
      "id, claim_status, claim_code, claim_token, claim_url, claim_qr_url, qr_link, qr_code_data_url",
      { count: "exact" },
    )
    .order("id", { ascending: true })
    .range(from, to);

  if (error) throw error;

  let updated = 0;
  let repairedLegacyUrls = 0;
  let regeneratedQrs = 0;
  const errors: Array<{ id: string | number; error: string }> = [];

  for (const row of data || []) {
    try {
      const hadLegacyUrl =
        isLegacyClaimValue(row.claim_url) || isLegacyClaimValue(row.qr_link);

      if (!needsClaimRepair(row, options)) continue;

      const fields = await ensureClaimFields(row, {
        table,
        forceCanonicalUrl: options.forceCanonicalUrl || hadLegacyUrl,
        regenerateQr: options.regenerateQr || hadLegacyUrl,
      });

      await supabaseAdmin.from(table).update(fields).eq("id", row.id).throwOnError();

      updated += 1;
      if (hadLegacyUrl) repairedLegacyUrls += 1;
      if (options.regenerateQr || hadLegacyUrl) regeneratedQrs += 1;
    } catch (error) {
      errors.push({
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const scanned = data?.length || 0;
  const total = count || 0;
  const nextOffset = offset + scanned;
  const done = scanned === 0 || nextOffset >= total;

  return {
    table,
    offset,
    batchSize,
    scanned,
    total,
    nextOffset,
    done,
    updated,
    repairedLegacyUrls,
    regeneratedQrs,
    errors,
  };
}

export async function syncClaimFieldsToLocations(
  options: { forceCanonicalUrl?: boolean; regenerateQr?: boolean } = {},
) {
  const restaurants = await ensureClaimFieldsForTable("restaurants", 5000, options);
  const activities = await ensureClaimFieldsForTable("activities", 5000, options);

  let locationsSynced = 0;

  for (const table of ["restaurants", "activities"] as const) {
    const { data } = await supabaseAdmin
      .from(table)
      .select(
        "id, claim_status, claim_code, claim_token, claim_url, claim_qr_url, qr_link, qr_code_data_url",
      );

    for (const row of data || []) {
      try {
        await supabaseAdmin
          .from("locations")
          .update({
            claim_status: row.claim_status || "unclaimed",
            claim_code: row.claim_code,
            claim_token: row.claim_token,
            claim_url: row.claim_url,
            claim_qr_url: row.claim_qr_url,
            qr_link: row.qr_link,
            qr_code_data_url: row.qr_code_data_url,
          })
          .eq("source_table", table)
          .eq("source_id", String(row.id))
          .throwOnError();

        locationsSynced += 1;
      } catch {
        // Keep bulk repair moving even if one synced location fails.
      }
    }
  }

  const ensuredLocations = await ensureClaimFieldsForTable("locations", 5000, options);

  return {
    restaurants: {
      updated: restaurants.updated,
      repairedLegacyUrls: restaurants.repairedLegacyUrls,
      regeneratedQrs: restaurants.regeneratedQrs,
    },
    activities: {
      updated: activities.updated,
      repairedLegacyUrls: activities.repairedLegacyUrls,
      regeneratedQrs: activities.regeneratedQrs,
    },
    locationsSynced,
    locationsEnsured: ensuredLocations.updated,
    locationsRepairedLegacyUrls: ensuredLocations.repairedLegacyUrls,
    locationsRegeneratedQrs: ensuredLocations.regeneratedQrs,
    errors: [...restaurants.errors, ...activities.errors, ...ensuredLocations.errors],
  };
}

export async function syncClaimFieldsToLocationsBatch(
  options: {
    table: ClaimSourceTable;
    offset?: number;
    batchSize?: number;
    forceCanonicalUrl?: boolean;
    regenerateQr?: boolean;
  },
) {
  const batch = await ensureClaimFieldsForTableBatch(options.table, options);

  let locationsSynced = 0;
  const syncErrors: Array<{ id: string | number; error: string }> = [];

  if (options.table === "restaurants" || options.table === "activities") {
    const { data } = await supabaseAdmin
      .from(options.table)
      .select(
        "id, claim_status, claim_code, claim_token, claim_url, claim_qr_url, qr_link, qr_code_data_url",
      )
      .order("id", { ascending: true })
      .range(batch.offset, batch.offset + batch.scanned - 1);

    for (const row of data || []) {
      try {
        await supabaseAdmin
          .from("locations")
          .update({
            claim_status: row.claim_status || "unclaimed",
            claim_code: row.claim_code,
            claim_token: row.claim_token,
            claim_url: row.claim_url,
            claim_qr_url: row.claim_qr_url,
            qr_link: row.qr_link,
            qr_code_data_url: row.qr_code_data_url,
          })
          .eq("source_table", options.table)
          .eq("source_id", String(row.id))
          .throwOnError();

        locationsSynced += 1;
      } catch (error) {
        syncErrors.push({
          id: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    ...batch,
    locationsSynced,
    errors: [...batch.errors, ...syncErrors],
  };
}
