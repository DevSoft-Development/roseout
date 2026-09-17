export type WebSurface = "consumer" | "admin" | "business";

export function normalizeWebSurface(value: string | null | undefined): WebSurface {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "admin" || normalized === "business") return normalized;
  return "consumer";
}

export function webSurfaceAuthFallbackPath(surface: WebSurface) {
  if (surface === "admin") return "/admin/login";
  if (surface === "business") return "/login";
  return "/create";
}
