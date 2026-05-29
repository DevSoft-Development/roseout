import crypto from "crypto";
import QRCode from "qrcode";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type ClaimLocationType = "restaurant" | "activity" | "location";
type ClaimSourceTable = "restaurants" | "activities" | "locations";

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

const missing = (v: unknown) => !String(v ?? "").trim();
const legacyClaimUrl = (v: unknown) => String(v ?? "").includes("/location/apply/claim") || String(v ?? "").includes("/claim/");
export function getClaimSiteUrl() { return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://theouthaven.vercel.app").replace(/\/$/, ""); }
export function generateClaimToken() { return crypto.randomUUID(); }
export function generateClaimCode() { const raw = Array.from(crypto.randomBytes(CLAIM_CODE_LENGTH), (b) => CLAIM_CODE_ALPHABET[b % CLAIM_CODE_ALPHABET.length]).join(""); return `TOH-${raw.slice(0, 4)}-${raw.slice(4)}`; }
export function normalizeClaimCode(value: unknown) { return String(value || "").trim().toUpperCase().replace(/\s+/g, ""); }
export function getClaimUrl(claimCode: string) { return `${getClaimSiteUrl()}/business/claim?code=${encodeURIComponent(normalizeClaimCode(claimCode))}`; }
async function generateQrDataUrl(claimUrl: string) { return QRCode.toDataURL(claimUrl, { margin: 2, width: 700 }); }

async function isClaimCodeAvailable(code: string, current?: { table: ClaimSourceTable; id: string | number }) {
  for (const table of ["locations", "restaurants", "activities"] as ClaimSourceTable[]) {
    let query = supabaseAdmin.from(table).select("id").eq("claim_code", code).limit(1);
    if (current?.table === table) query = query.neq("id", current.id);
    const { data, error } = await query;
    if (error) throw error;
    if (data?.length) return false;
  }
  return true;
}

export async function generateUniqueClaimCode(current?: { table: ClaimSourceTable; id: string | number }) {
  for (let i = 0; i < 20; i += 1) { const code = generateClaimCode(); if (await isClaimCodeAvailable(code, current)) return code; }
  throw new Error("Could not generate a unique claim code.");
}

export async function createClaimQr(_type: ClaimLocationType = "location") {
  const claim_code = generateClaimCode();
  const claim_token = generateClaimToken();
  const claim_url = getClaimUrl(claim_code);
  const qrCodeDataUrl = await generateQrDataUrl(claim_url);
  return { claim_code, claim_token, claim_url, claim_status: "unclaimed", qr_link: claim_url, claim_qr_url: qrCodeDataUrl, qr_code_data_url: qrCodeDataUrl };
}

export async function ensureClaimFields(row: ClaimFieldRow, options: { table?: ClaimSourceTable; regenerateCode?: boolean; regenerateToken?: boolean; regenerateQr?: boolean } = {}) {
  const current = options.table && row.id ? { table: options.table, id: row.id } : undefined;
  const claim_code = options.regenerateCode || missing(row.claim_code) ? await generateUniqueClaimCode(current) : normalizeClaimCode(row.claim_code);
  const claim_token = options.regenerateToken || missing(row.claim_token) ? generateClaimToken() : String(row.claim_token);
  const claim_url = options.regenerateCode || options.regenerateToken || missing(row.claim_url) || legacyClaimUrl(row.claim_url) ? getClaimUrl(claim_code) : String(row.claim_url);
  const needsQr = options.regenerateQr || options.regenerateCode || options.regenerateToken || legacyClaimUrl(row.claim_url) || missing(row.qr_code_data_url) || missing(row.claim_qr_url);
  const qr_code_data_url = needsQr ? await generateQrDataUrl(claim_url) : String(row.qr_code_data_url || row.claim_qr_url);
  return { claim_code, claim_token, claim_url, claim_status: row.claim_status || "unclaimed", qr_link: missing(row.qr_link) || legacyClaimUrl(row.qr_link) ? claim_url : String(row.qr_link), claim_qr_url: missing(row.claim_qr_url) || needsQr ? qr_code_data_url : String(row.claim_qr_url), qr_code_data_url };
}

export async function ensureClaimFieldsForTable(table: ClaimSourceTable, limit = 5000) {
  const { data, error } = await supabaseAdmin.from(table).select("id, claim_status, claim_code, claim_token, claim_url, claim_qr_url, qr_link, qr_code_data_url").limit(limit);
  if (error) throw error;
  let updated = 0; const errors: Array<{ id: string | number; error: string }> = [];
  for (const row of data || []) {
    try {
      if ([row.claim_code,row.claim_token,row.claim_url,row.claim_qr_url,row.qr_link,row.qr_code_data_url,row.claim_status].some(missing)) {
        const fields = await ensureClaimFields(row, { table });
        await supabaseAdmin.from(table).update(fields).eq("id", row.id).throwOnError();
        updated += 1;
      }
    } catch (e) { errors.push({ id: row.id, error: e instanceof Error ? e.message : String(e) }); }
  }
  return { table, scanned: data?.length || 0, updated, errors };
}

export async function syncClaimFieldsToLocations() {
  const restaurants = await ensureClaimFieldsForTable("restaurants");
  const activities = await ensureClaimFieldsForTable("activities");

  let locationsSynced = 0;
  for (const table of ["restaurants", "activities"] as const) {
    const { data } = await supabaseAdmin.from(table).select("id, claim_status, claim_code, claim_token, claim_url, claim_qr_url, qr_link, qr_code_data_url");
    for (const row of data || []) {
      try {
        await supabaseAdmin.from("locations").update({ claim_status: row.claim_status || "unclaimed", claim_code: row.claim_code, claim_token: row.claim_token, claim_url: row.claim_url, claim_qr_url: row.claim_qr_url, qr_link: row.qr_link, qr_code_data_url: row.qr_code_data_url }).eq("source_table", table).eq("source_id", String(row.id)).throwOnError();
        locationsSynced += 1;
      } catch {}
    }
  }

  const ensuredLocations = await ensureClaimFieldsForTable("locations");
  return { restaurants: { updated: restaurants.updated }, activities: { updated: activities.updated }, locationsSynced, locationsEnsured: ensuredLocations.updated, errors: [...restaurants.errors, ...activities.errors, ...ensuredLocations.errors] };
}
