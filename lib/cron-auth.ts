import { NextResponse } from "next/server";

export function isCronRequestAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";

  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  return token === secret || request.headers.get("x-cron-secret") === secret;
}

export function requireCronRequest(request: Request) {
  if (isCronRequestAuthorized(request)) return null;
  return NextResponse.json(
    { success: false, action: "cron", error: "Unauthorized cron request." },
    { status: 401 },
  );
}
