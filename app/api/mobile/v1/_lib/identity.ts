import { NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type MobileIdentity =
  | { kind: "user"; userId: string; email: string | null; guestId: string | null }
  | { kind: "guest"; userId: null; email: null; guestId: string };

const GUEST_ID_PATTERN = /^guest_[A-Za-z0-9_-]{16,128}$/;

function readBearer(req: NextRequest) {
  const value = req.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function readGuestId(req: NextRequest) {
  const value = (req.headers.get("x-theouthaven-guest-id") || "").trim();
  return GUEST_ID_PATTERN.test(value) ? value : null;
}

export async function resolveMobileIdentity(req: NextRequest): Promise<MobileIdentity | null> {
  const guestId = readGuestId(req);
  const bearer = readBearer(req);

  if (bearer) {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.auth.getUser(bearer);
    if (!error && data.user) {
      return {
        kind: "user",
        userId: data.user.id,
        email: data.user.email || null,
        guestId,
      };
    }
    return null;
  }

  if (guestId) {
    return { kind: "guest", userId: null, email: null, guestId };
  }

  return null;
}

export async function requireMobileIdentity(req: NextRequest) {
  return resolveMobileIdentity(req);
}
