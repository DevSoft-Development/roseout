const CANONICAL_SITE_URL = "https://www.TheOutHaven.com";

function normalizeSiteUrl(value?: string | null): string {
  const raw = (value || "").trim();
  if (!raw) return CANONICAL_SITE_URL;

  let withProtocol =
    raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;

  withProtocol = withProtocol.replace(/\/+$/, "");
  const lower = withProtocol.toLowerCase();

  if (
    lower.includes("roseout.vercel.app") ||
    lower === "https://theouthaven.com" ||
    lower === "http://theouthaven.com"
  ) {
    return CANONICAL_SITE_URL;
  }

  return withProtocol;
}

export function getSiteUrl(): string {
  return normalizeSiteUrl(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      CANONICAL_SITE_URL,
  );
}

export function buildSiteUrl(path: string): string {
  const siteUrl = getSiteUrl();
  const input = String(path || "/").trim();

  if (!input || input === "/") return siteUrl;

  try {
    const parsed = new URL(input);
    const lower = parsed.origin.toLowerCase();

    if (
      lower.includes("roseout.vercel.app") ||
      lower === "https://theouthaven.com" ||
      lower === "http://theouthaven.com"
    ) {
      return `${siteUrl}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return parsed.toString();
  } catch {
    const normalizedPath = input.startsWith("/") ? input : `/${input}`;
    return `${siteUrl}${normalizedPath}`;
  }
}

export function getCreatePasswordUrl(token: string): string {
  return `${getSiteUrl()}/auth/create-password?token=${encodeURIComponent(token.trim())}`;
}
