import crypto from "crypto";
import QRCode from "qrcode";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildClaimUrlFromCode, normalizeClaimCode } from "@/lib/claimQr";
import { getSiteUrl } from "@/lib/site-url";

const CLAIM_CODE_LENGTH = 10;
const CLAIM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function missing(value: unknown) {
  return value == null || String(value).trim().length === 0;
}

function slugify(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateClaimCode() {
  const raw = Array.from(
    crypto.randomBytes(CLAIM_CODE_LENGTH),
    (byte) => CLAIM_CODE_ALPHABET[byte % CLAIM_CODE_ALPHABET.length],
  ).join("");
  return `TOH-${raw.slice(0, 4)}-${raw.slice(4, 7)}-${raw.slice(7)}`;
}

async function uniqueClaimCode(currentId?: string | number) {
  for (let index = 0; index < 20; index += 1) {
    const code = generateClaimCode();
    let query = supabaseAdmin
      .from("locations")
      .select("id")
      .eq("claim_code", code)
      .limit(1);
    if (currentId) query = query.neq("id", currentId);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) return code;
  }
  throw new Error("Could not generate a unique claim code.");
}

async function qr(value: string) {
  return QRCode.toDataURL(value, { margin: 2, width: 700 });
}

function rowComplete(row: Record<string, unknown>) {
  return (
    !missing(row.claim_code) &&
    !missing(row.claim_qr_url) &&
    !missing(row.claim_qr_code_url) &&
    !missing(row.qr_code_data_url) &&
    !missing(row.qr_code_url)
  );
}

export async function ensureLocationQrFields(row: Record<string, unknown>) {
  const site = getSiteUrl();
  const claimCode = missing(row.claim_code)
    ? await uniqueClaimCode(row.id as string | number | undefined)
    : normalizeClaimCode(String(row.claim_code));
  const claimUrl = missing(row.claim_url)
    ? `${site}${buildClaimUrlFromCode(claimCode)}`
    : String(row.claim_url);
  const slug = slugify(row.slug || row.name || row.restaurant_name || row.activity_name);
  const publicLocationUrl = missing(row.public_location_url)
    ? `${site}/locations/${slug || row.id}`
    : String(row.public_location_url);

  const updates: Record<string, string> = {};
  if (missing(row.claim_code)) updates.claim_code = claimCode;
  if (missing(row.claim_url)) updates.claim_url = claimUrl;
  if (missing(row.qr_link)) updates.qr_link = claimUrl;
  if (missing(row.public_location_url)) updates.public_location_url = publicLocationUrl;

  const needsClaimQr = missing(row.claim_qr_url) || missing(row.claim_qr_code_url);
  if (needsClaimQr) {
    const claimQr = await qr(claimUrl);
    if (missing(row.claim_qr_url)) updates.claim_qr_url = claimQr;
    if (missing(row.claim_qr_code_url)) updates.claim_qr_code_url = claimQr;
  }

  const needsPublicQr = missing(row.qr_code_data_url) || missing(row.qr_code_url);
  if (needsPublicQr) {
    const publicQr = await qr(publicLocationUrl);
    if (missing(row.qr_code_data_url)) updates.qr_code_data_url = publicQr;
    if (missing(row.qr_code_url)) updates.qr_code_url = publicQr;
  }

  return updates;
}

export async function generateMissingLocationQrs(
  limit = 100,
  ids?: Array<string | number>,
) {
  let query = supabaseAdmin
    .from("locations")
    .select(
      "id, slug, name, restaurant_name, activity_name, claim_status, claim_code, claim_url, claim_qr_url, claim_qr_code_url, qr_link, qr_code_data_url, qr_code_url, public_location_url",
    )
    .eq("is_searchable", true)
    .eq("quality_status", "publish_ready")
    .not("address", "is", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .not("primary_category", "is", null)
    .or("duplicate_status.is.null,duplicate_status.neq.duplicate")
    .or(
      [
        "qr_code_url.is.null",
        "qr_code_data_url.is.null",
        "claim_qr_url.is.null",
        "claim_qr_code_url.is.null",
        "claim_code.is.null",
      ].join(","),
    )
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 500));
  if (ids?.length) query = query.in("id", ids);
  const { data, error } = await query;
  if (error) throw error;

  let processed = 0;
  let generatedPublicQrs = 0;
  let generatedClaimQrs = 0;
  let generatedClaimCodes = 0;
  let skippedAlreadyComplete = 0;
  const failed: Array<{ id: string | number; error: string }> = [];

  for (const row of data || []) {
    processed += 1;
    try {
      if (rowComplete(row)) {
        skippedAlreadyComplete += 1;
        continue;
      }
      const updates = await ensureLocationQrFields(row);
      if (!Object.keys(updates).length) {
        skippedAlreadyComplete += 1;
        continue;
      }
      const { error: updateError } = await supabaseAdmin
        .from("locations")
        .update(updates)
        .eq("id", row.id);
      if (updateError) throw updateError;
      if (updates.qr_code_url || updates.qr_code_data_url) generatedPublicQrs += 1;
      if (updates.claim_qr_url || updates.claim_qr_code_url) generatedClaimQrs += 1;
      if (updates.claim_code) generatedClaimCodes += 1;
    } catch (error) {
      failed.push({
        id: row.id as string | number,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    processed,
    generatedPublicQrs,
    generatedClaimQrs,
    generatedClaimCodes,
    skippedAlreadyComplete,
    failed,
  };
}
