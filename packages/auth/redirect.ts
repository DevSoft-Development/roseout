const BLOCKED_INTENDED_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/logout",
  "/auth",
  "/api/auth",
];

export function sanitizeIntendedPath(path: string | null | undefined): string | null {
  if (!path) return null;

  const trimmedPath = path.trim();
  const lowerPath = trimmedPath.toLowerCase();

  if (!trimmedPath.startsWith("/")) return null;
  if (trimmedPath.startsWith("//")) return null;
  if (lowerPath.startsWith("javascript:")) return null;

  const pathname = trimmedPath.split(/[?#]/, 1)[0].toLowerCase();

  if (
    BLOCKED_INTENDED_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return null;
  }

  try {
    const url = new URL(trimmedPath, "https://theouthaven.local");
    if (url.origin !== "https://theouthaven.local") return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
