import "server-only";

import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeClaimCode } from "@/lib/claimQr";

export type ClaimContactChannel = "email" | "sms";

type ClaimCodeRow = {
  id: string;
  location_id: string;
  status: string | null;
  expires_at: string | null;
  claimed_at: string | null;
  revoked_at: string | null;
};

type LocationRow = Record<string, any> & { id: string };

const LOCATION_SELECT = [
  "id",
  "name",
  "restaurant_name",
  "activity_name",
  "address",
  "city",
  "borough",
  "state",
  "zip_code",
  "location_type",
  "primary_category",
  "phone",
  "website",
  "claim_status",
  "is_claimed",
  "claimed",
  "owner_user_id",
  "claimed_by_email",
  "owner_email",
  "owner_phone",
  "main_image",
  "image_url",
  "images",
  "operating_hours",
  "reservation_url",
  "reservation_link",
  "booking_url",
  "menu_url",
].join(",");

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function digits(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function hasHours(value: unknown) {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return clean(value).length > 0;
}

function firstPhoto(row: LocationRow) {
  if (clean(row.main_image)) return clean(row.main_image);
  if (clean(row.image_url)) return clean(row.image_url);
  if (Array.isArray(row.images)) {
    const photo = row.images.find((value: unknown) => clean(value));
    if (photo) return clean(photo);
  }
  return null;
}

function canonicalCodeError(row: ClaimCodeRow) {
  const status = clean(row.status).toLowerCase();
  if (row.revoked_at || ["revoked", "disabled", "failed"].includes(status)) return "disabled_code";
  if (row.claimed_at || ["claimed", "redeemed", "used"].includes(status)) return "used_code";
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return "expired_code";
  if (!["sent", "active", "generated"].includes(status)) return "disabled_code";
  return null;
}

function blockedLocationError(row: LocationRow) {
  const status = clean(row.claim_status).toLowerCase();
  if (row.is_claimed || row.claimed || row.owner_user_id || status === "claimed") return "location_claimed";
  return null;
}

export function normalizeClaimContact(channel: ClaimContactChannel, value: unknown) {
  if (channel === "email") return clean(value).toLowerCase();
  const valueDigits = digits(value);
  if (valueDigits.length === 10) return `+1${valueDigits}`;
  if (valueDigits.length === 11 && valueDigits.startsWith("1")) return `+${valueDigits}`;
  return valueDigits ? `+${valueDigits}` : "";
}

export function maskClaimContact(channel: ClaimContactChannel, normalized: string) {
  if (channel === "email") {
    const [local, domain] = normalized.split("@");
    if (!local || !domain) return "your email";
    return `${local.slice(0, 2)}***@${domain}`;
  }
  const valueDigits = digits(normalized);
  return valueDigits.length >= 4 ? `***-***-${valueDigits.slice(-4)}` : "your mobile";
}

export function hashClaimValue(value: string) {
  const secret = process.env.CLAIM_OTP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing CLAIM_OTP_SECRET or SUPABASE_SERVICE_ROLE_KEY.");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function generateClaimOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

export function claimContactMatchesLocation(channel: ClaimContactChannel, normalized: string, row: LocationRow) {
  if (channel === "sms") {
    const candidate = digits(normalized);
    return [row.phone, row.owner_phone].some((value) => {
      const expected = digits(value);
      return Boolean(candidate && expected && candidate.slice(-10) === expected.slice(-10));
    });
  }

  const email = normalized.toLowerCase();
  const knownEmails = [row.owner_email, row.claimed_by_email]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean);
  if (knownEmails.includes(email)) return true;

  const domain = email.split("@")[1] || "";
  if (!domain || !row.website) return false;
  try {
    const website = new URL(String(row.website).startsWith("http") ? String(row.website) : `https://${row.website}`);
    const host = website.hostname.toLowerCase().replace(/^www\./, "");
    return domain === host || domain.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

export function publicClaimLocation(row: LocationRow) {
  const missingItems: string[] = [];
  const photo = firstPhoto(row);
  const reservationLink = clean(row.reservation_url || row.reservation_link || row.booking_url) || null;
  if (!hasHours(row.operating_hours)) missingItems.push("hours");
  if (!photo) missingItems.push("photos");
  if (!reservationLink) missingItems.push("reservation link");
  if (!clean(row.menu_url)) missingItems.push("menu information");
  if (!clean(row.website)) missingItems.push("website");
  if (!clean(row.phone)) missingItems.push("phone");

  const tracked = 6;
  const completed = tracked - missingItems.length;
  const profileStrength = Math.max(0, Math.round((completed / tracked) * 100));

  return {
    id: row.id,
    name: clean(row.name || row.restaurant_name || row.activity_name) || "TheOutHaven location",
    address: row.address || null,
    city: row.city || null,
    borough: row.borough || null,
    state: row.state || null,
    zipCode: row.zip_code || null,
    locationType: row.location_type || null,
    primaryCategory: row.primary_category || null,
    phone: row.phone || null,
    website: row.website || null,
    claimStatus: row.claim_status || "unclaimed",
    photo,
    hours: row.operating_hours || null,
    reservationLink,
    menuUrl: row.menu_url || null,
    missingItems,
    attentionCount: missingItems.length,
    profileStrength,
  };
}

export async function lookupSecureClaim(codeValue: unknown) {
  const code = normalizeClaimCode(String(codeValue || ""));
  if (!code) return { ok: false as const, error: "empty_code" };

  const { data: claimCode, error: codeError } = await supabaseAdmin
    .from("location_claim_codes")
    .select("id,location_id,status,expires_at,claimed_at,revoked_at")
    .or(`code.eq.${code},claim_code.eq.${code}`)
    .limit(1)
    .maybeSingle();
  if (codeError) throw codeError;

  let locationId = claimCode?.location_id ? String(claimCode.location_id) : null;
  const canonicalClaimCode = claimCode as unknown as ClaimCodeRow | null;

  if (canonicalClaimCode) {
    const error = canonicalCodeError(canonicalClaimCode);
    if (error) return { ok: false as const, error };
  }

  if (!locationId) {
    const { data: legacyLocation, error: legacyError } = await supabaseAdmin
      .from("locations")
      .select("id")
      .eq("claim_code", code)
      .maybeSingle();
    if (legacyError) throw legacyError;
    locationId = legacyLocation?.id ? String(legacyLocation.id) : null;
  }

  if (!locationId) return { ok: false as const, error: "invalid_code" };

  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select(LOCATION_SELECT)
    .eq("id", locationId)
    .maybeSingle();
  if (locationError) throw locationError;
  if (!location) return { ok: false as const, error: "invalid_code" };

  const locationRow = location as unknown as LocationRow;
  const blocked = blockedLocationError(locationRow);
  if (blocked) return { ok: false as const, error: blocked };

  return {
    ok: true as const,
    code,
    claimCode: canonicalClaimCode,
    location: locationRow,
    publicLocation: publicClaimLocation(locationRow),
  };
}

export async function logClaimFunnelEvent(params: {
  locationId: string;
  claimCodeId?: string | null;
  challengeId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin.from("claim_funnel_events").insert({
      location_id: params.locationId,
      claim_code_id: params.claimCodeId || null,
      challenge_id: params.challengeId || null,
      event_type: params.eventType,
      metadata: params.metadata || {},
    });
  } catch (error) {
    console.warn("Claim funnel event skipped", error instanceof Error ? error.message : String(error));
  }
}
