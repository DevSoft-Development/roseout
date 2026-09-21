import "server-only";

import crypto from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const RESERVE_LOBBY_DISPLAY_COOKIE = "reserve_lobby_display";

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function pairingCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export async function createLobbyDisplayPairing(input: {
  locationId: string;
  label?: string | null;
  createdByUserId?: string | null;
  privacyMode?: "initials" | "anonymous";
  showEstimatedWait?: boolean;
  showReservationTime?: boolean;
  showWaitlistPosition?: boolean;
  readyHoldMinutes?: number;
  promoEnabled?: boolean;
  promoMediaType?: "image" | "video";
  promoMediaUrl?: string | null;
  promoHeadline?: string | null;
  promoBody?: string | null;
  promoLinkLabel?: string | null;
  promoLinkUrl?: string | null;
}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = pairingCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const { data, error } = await supabaseAdmin
      .from("reserve_lobby_displays")
      .insert({
        location_id: input.locationId,
        label: String(input.label || "Lobby TV").trim().slice(0, 120) || "Lobby TV",
        pairing_code_hash: hash(code),
        pairing_expires_at: expiresAt.toISOString(),
        privacy_mode: input.privacyMode || "initials",
        show_estimated_wait: input.showEstimatedWait !== false,
        show_reservation_time: input.showReservationTime !== false,
        show_waitlist_position: input.showWaitlistPosition !== false,
        ready_hold_minutes: Math.min(60, Math.max(1, Number(input.readyHoldMinutes || 10))),
        promo_enabled: Boolean(input.promoEnabled),
        promo_media_type: input.promoMediaType === "video" ? "video" : "image",
        promo_media_url: input.promoMediaUrl || null,
        promo_headline: input.promoHeadline || null,
        promo_body: input.promoBody || null,
        promo_link_label: input.promoLinkLabel || null,
        promo_link_url: input.promoLinkUrl || null,
        created_by_user_id: input.createdByUserId || null,
      })
      .select("id,location_id,label,status,privacy_mode,show_estimated_wait,show_reservation_time,show_waitlist_position,ready_hold_minutes,promo_enabled,promo_media_type,promo_media_url,promo_headline,promo_body,promo_link_label,promo_link_url,pairing_expires_at,paired_at,last_seen_at,created_at")
      .single();
    if (!error && data) return { display: data, code };
    if (error?.code !== "23505") throw error;
  }
  throw new Error("Unable to generate a unique pairing code.");
}

export async function pairLobbyDisplay(code: string) {
  const normalized = String(code || "").replace(/\D/g, "").slice(0, 6);
  if (!/^\d{6}$/.test(normalized)) return null;

  const { data: display, error } = await supabaseAdmin
    .from("reserve_lobby_displays")
    .select("*")
    .eq("pairing_code_hash", hash(normalized))
    .eq("status", "active")
    .gt("pairing_expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !display) return null;

  const token = crypto.randomBytes(32).toString("base64url");
  const { data, error: updateError } = await supabaseAdmin
    .from("reserve_lobby_displays")
    .update({
      token_hash: hash(token),
      pairing_code_hash: null,
      pairing_expires_at: null,
      paired_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", display.id)
    .eq("status", "active")
    .select("id,location_id,label,status,privacy_mode,show_estimated_wait,show_reservation_time,show_waitlist_position,ready_hold_minutes,promo_enabled,promo_media_type,promo_media_url,promo_headline,promo_body,promo_link_label,promo_link_url,paired_at,last_seen_at,created_at")
    .single();
  if (updateError || !data) return null;

  const store = await cookies();
  store.set(RESERVE_LOBBY_DISPLAY_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return data;
}

export async function getLobbyDisplaySession() {
  const store = await cookies();
  const token = store.get(RESERVE_LOBBY_DISPLAY_COOKIE)?.value || "";
  if (!token) return null;
  const { data, error } = await supabaseAdmin
    .from("reserve_lobby_displays")
    .select("id,location_id,label,status,privacy_mode,show_estimated_wait,show_reservation_time,show_waitlist_position,ready_hold_minutes,promo_enabled,promo_media_type,promo_media_url,promo_headline,promo_body,promo_link_label,promo_link_url,paired_at,last_seen_at,created_at")
    .eq("token_hash", hash(token))
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) return null;

  void supabaseAdmin
    .from("reserve_lobby_displays")
    .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", data.id);
  return data;
}

export async function listLobbyDisplays(locationId: string) {
  const { data, error } = await supabaseAdmin
    .from("reserve_lobby_displays")
    .select("id,location_id,label,status,privacy_mode,show_estimated_wait,show_reservation_time,show_waitlist_position,ready_hold_minutes,promo_enabled,promo_media_type,promo_media_url,promo_headline,promo_body,promo_link_label,promo_link_url,pairing_expires_at,paired_at,last_seen_at,revoked_at,created_at")
    .eq("location_id", locationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateLobbyDisplay(locationId: string, displayId: string, patch: Record<string, unknown>) {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.label !== undefined) updates.label = String(patch.label || "Lobby TV").trim().slice(0, 120) || "Lobby TV";
  if (patch.privacyMode === "initials" || patch.privacyMode === "anonymous") updates.privacy_mode = patch.privacyMode;
  if (patch.showEstimatedWait !== undefined) updates.show_estimated_wait = Boolean(patch.showEstimatedWait);
  if (patch.showReservationTime !== undefined) updates.show_reservation_time = Boolean(patch.showReservationTime);
  if (patch.showWaitlistPosition !== undefined) updates.show_waitlist_position = Boolean(patch.showWaitlistPosition);
  if (patch.readyHoldMinutes !== undefined) updates.ready_hold_minutes = Math.min(60, Math.max(1, Number(patch.readyHoldMinutes) || 10));
  if (patch.promoEnabled !== undefined) updates.promo_enabled = Boolean(patch.promoEnabled);
  if (patch.promoMediaType === "image" || patch.promoMediaType === "video") updates.promo_media_type = patch.promoMediaType;
  if (patch.promoMediaUrl !== undefined) updates.promo_media_url = String(patch.promoMediaUrl || "").trim().slice(0, 2000) || null;
  if (patch.promoHeadline !== undefined) updates.promo_headline = String(patch.promoHeadline || "").trim().slice(0, 120) || null;
  if (patch.promoBody !== undefined) updates.promo_body = String(patch.promoBody || "").trim().slice(0, 320) || null;
  if (patch.promoLinkLabel !== undefined) updates.promo_link_label = String(patch.promoLinkLabel || "").trim().slice(0, 80) || null;
  if (patch.promoLinkUrl !== undefined) updates.promo_link_url = String(patch.promoLinkUrl || "").trim().slice(0, 2000) || null;

  const { data, error } = await supabaseAdmin
    .from("reserve_lobby_displays")
    .update(updates)
    .eq("id", displayId)
    .eq("location_id", locationId)
    .eq("status", "active")
    .select("id,location_id,label,status,privacy_mode,show_estimated_wait,show_reservation_time,show_waitlist_position,ready_hold_minutes,promo_enabled,promo_media_type,promo_media_url,promo_headline,promo_body,promo_link_label,promo_link_url,paired_at,last_seen_at,created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function revokeLobbyDisplay(locationId: string, displayId: string) {
  const { error } = await supabaseAdmin
    .from("reserve_lobby_displays")
    .update({
      status: "revoked",
      token_hash: null,
      pairing_code_hash: null,
      pairing_expires_at: null,
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", displayId)
    .eq("location_id", locationId);
  if (error) throw error;
}

export function guestDisplayLabel(name: unknown, rowId: unknown, mode: string) {
  if (mode === "anonymous") {
    const digest = crypto.createHash("sha256").update(String(rowId || "")).digest();
    const number = 100 + (digest.readUInt16BE(0) % 900);
    return `Party ${number}`;
  }

  const clean = String(name || "").trim().replace(/\s+/g, " ");
  if (!clean) return "Guest";
  const parts = clean.split(" ");
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].slice(0, 1).toUpperCase()}.`;
}
