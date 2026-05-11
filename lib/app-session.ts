import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { normalizeRole } from "@/lib/dashboard-permissions";

export const APP_SESSION_COOKIE = "theouthaven_session";
const APP_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

type AppSessionPayload = {
  id: string;
  email: string | null;
  role: string | null;
  fullName: string | null;
  exp: number;
};

function getSessionSecret() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "theouthaven-local-session-secret"
  );
}

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string) {
  return createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function getUserRole(user: User) {
  return (
    normalizeRole(user.user_metadata?.role) ||
    normalizeRole(user.user_metadata?.account_type) ||
    normalizeRole(user.app_metadata?.role) ||
    normalizeRole(user.app_metadata?.account_type) ||
    null
  );
}

export function createAppSessionValue(user: User) {
  const payload: AppSessionPayload = {
    id: user.id,
    email: user.email?.trim().toLowerCase() || null,
    role: getUserRole(user),
    fullName:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : null,
    exp: Math.floor(Date.now() / 1000) + APP_SESSION_MAX_AGE_SECONDS,
  };

  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function setAppSessionCookie(response: NextResponse, user: User) {
  response.cookies.set(APP_SESSION_COOKIE, createAppSessionValue(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: APP_SESSION_MAX_AGE_SECONDS,
  });
}

export function parseAppSessionValue(value?: string) {
  if (!value) return null;

  const [encodedPayload, signature] = value.split(".");

  if (!encodedPayload || !signature || !safeEqual(signature, sign(encodedPayload))) {
    return null;
  }

  try {
    const payload = JSON.parse(decode(encodedPayload)) as AppSessionPayload;

    if (!payload.id || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function getAppSession() {
  const cookieStore = await cookies();
  return parseAppSessionValue(cookieStore.get(APP_SESSION_COOKIE)?.value);
}
