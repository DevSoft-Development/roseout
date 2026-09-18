import type { NextRequest } from "next/server";

export function resolveAdminAuthOrigin(request: NextRequest, requestUrl: URL) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : requestUrl.protocol.replace(":", "");

  return host ? `${protocol}://${host}` : requestUrl.origin;
}
