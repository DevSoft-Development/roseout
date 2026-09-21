import "server-only";

import crypto from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const RESERVE_DEVICE_COOKIE = "reserve_device_session";

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function authorizeReserveDevice(input: {
  locationId: string;
  label?: string | null;
  authorizedByUserId?: string | null;
}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const { data, error } = await supabaseAdmin
    .from("reserve_authorized_devices")
    .insert({
      location_id: input.locationId,
      token_hash: tokenHash(token),
      label: String(input.label || "Reserve device").trim().slice(0, 120) || "Reserve device",
      authorized_by_user_id: input.authorizedByUserId || null,
      status: "active",
    })
    .select("id,location_id,label,status,last_seen_at,created_at")
    .single();
  if (error) throw error;

  const store = await cookies();
  store.set(RESERVE_DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return data;
}

export async function getReserveAuthorizedDevice(locationId?: string | null) {
  const store = await cookies();
  const token = store.get(RESERVE_DEVICE_COOKIE)?.value || "";
  if (!token) return null;

  let query = supabaseAdmin
    .from("reserve_authorized_devices")
    .select("id,location_id,label,status,authorized_by_user_id,last_seen_at,created_at")
    .eq("token_hash", tokenHash(token))
    .eq("status", "active")
    .limit(1);
  if (locationId) query = query.eq("location_id", locationId);

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;

  void supabaseAdmin
    .from("reserve_authorized_devices")
    .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", data.id);

  return data;
}

export async function listReserveAuthorizedDevices(locationId: string) {
  const { data, error } = await supabaseAdmin
    .from("reserve_authorized_devices")
    .select("id,location_id,label,status,last_seen_at,revoked_at,created_at")
    .eq("location_id", locationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function revokeReserveAuthorizedDevice(locationId: string, deviceId: string) {
  const { error } = await supabaseAdmin
    .from("reserve_authorized_devices")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", deviceId)
    .eq("location_id", locationId);
  if (error) throw error;

  const current = await getReserveAuthorizedDevice(locationId);
  if (current?.id === deviceId) {
    const store = await cookies();
    store.delete(RESERVE_DEVICE_COOKIE);
  }
}
