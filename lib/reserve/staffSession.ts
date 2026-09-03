import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";

const COOKIE_NAME = "reserve_staff_session";
const SESSION_HOURS = 12;

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createReserveStaffSession(input: {
  locationId: string;
  staffProfileId: string;
  deviceLabel?: string | null;
}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  const { error } = await supabaseAdmin.from("reserve_staff_sessions").insert({
    location_id: input.locationId,
    staff_profile_id: input.staffProfileId,
    token_hash: tokenHash(token),
    device_label: input.deviceLabel || null,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return { expiresAt: expiresAt.toISOString() };
}

export async function getReserveStaffSession(locationId?: string | null) {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value || "";
  if (!token) return null;
  let query = supabaseAdmin
    .from("reserve_staff_sessions")
    .select("*, reserve_staff_profiles(id,display_name,role,is_active,can_quick_switch)")
    .eq("token_hash", tokenHash(token))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query.maybeSingle();
  if (error || !data || data.reserve_staff_profiles?.is_active === false) return null;
  void supabaseAdmin
    .from("reserve_staff_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.id);
  return data;
}

export async function revokeReserveStaffSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value || "";
  if (token) {
    await supabaseAdmin
      .from("reserve_staff_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", tokenHash(token));
  }
  store.delete(COOKIE_NAME);
}
