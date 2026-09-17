import type { NextRequest } from "next/server";

export function resolveWebSurfaceAuthOrigin(request: NextRequest, requestUrl: URL) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.vercel.app").replace(/\/$/, "");
  const surface = process.env.THEOUTHAVEN_WEB_SURFACE?.trim().toLowerCase();

  if (surface !== "admin" && surface !== "business") return siteUrl;

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : requestUrl.protocol.replace(":", "");

  return host ? `${protocol}://${host}` : requestUrl.origin;
}

export function webSurfaceAuthFallbackPath() {
  const surface = process.env.THEOUTHAVEN_WEB_SURFACE?.trim().toLowerCase();
  if (surface === "admin") return "/admin/login";
  if (surface === "business") return "/login";
  return "/create";
}
