import type { NextRequest } from "next/server";

export type WebSurface = "consumer" | "admin" | "business";

export function normalizeWebSurface(value: string | null | undefined): WebSurface {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "admin" || normalized === "business") return normalized;
  return "consumer";
}

export function resolveWebSurfaceAuthOrigin(
  request: NextRequest,
  requestUrl: URL,
  surface = normalizeWebSurface(process.env.THEOUTHAVEN_WEB_SURFACE),
) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.vercel.app").replace(/\/$/, "");
  if (surface === "consumer") return siteUrl;

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : requestUrl.protocol.replace(":", "");

  return host ? `${protocol}://${host}` : requestUrl.origin;
}

export function webSurfaceAuthFallbackPath(surface: WebSurface) {
  if (surface === "admin") return "/admin/login";
  if (surface === "business") return "/business/login";
  return "/create";
}
