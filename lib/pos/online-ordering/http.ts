import { NextResponse } from "next/server";

export const ONLINE_ORDERING_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Idempotency-Key",
  "Access-Control-Max-Age": "86400",
} as const;

export function onlineOrderingJson(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...ONLINE_ORDERING_CORS, ...(init.headers || {}) },
  });
}

export function onlineOrderingOptions() {
  return new NextResponse(null, { status: 204, headers: ONLINE_ORDERING_CORS });
}

export function onlineOrderingErrorStatus(message: string) {
  if (message.includes("not_found")) return 404;
  if (
    message.includes("paused") ||
    message.includes("unavailable") ||
    message.includes("sold_out") ||
    message.includes("insufficient") ||
    message.includes("slot_full")
  ) return 409;
  if (
    message.includes("invalid") ||
    message.includes("missing") ||
    message.includes("too_soon") ||
    message.includes("too_far") ||
    message.includes("modifier")
  ) return 400;
  return 500;
}
