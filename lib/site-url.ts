const CANONICAL_SITE_URL = "https://theouthaven.com";

const LEGACY_HOSTS = [
  "roseout.com",
  "www.roseout.com",
  "roseout.vercel.app",
  "www.roseout.vercel.app",
  "theouthaven.vercel.app",
];

function normalizeSiteUrl(value?: string | null): string {
  const raw = String(value || "").trim();
  if (!raw) return CANONICAL_SITE_URL;

  let withProtocol =
    raw.startsWith("http://") || raw.startsWith("https://")
      ? raw
      : `https://${raw}`;

  withProtocol = withProtocol.replace(/\/+$/, "");

  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase();

    if (
      LEGACY_HOSTS.includes(host) ||
      host.endsWith(".roseout.com") ||
      parsed.origin.toLowerCase() === "http://theouthaven.com" ||
      parsed.origin.toLowerCase() === "https://theouthaven.com"
    ) {
      return CANONICAL_SITE_URL;
    }

    return parsed.origin;
  } catch {
    return CANONICAL_SITE_URL;
  }
}

export function getSiteUrl(): string {
  return normalizeSiteUrl(
    process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.APP_URL ||
      process.env.SITE_URL ||
      CANONICAL_SITE_URL,
  );
}

export function buildSiteUrl(path: string): string {
  const siteUrl = getSiteUrl();
  const input = String(path || "/").trim();

  if (!input || input === "/") return siteUrl;

  try {
    const parsed = new URL(input);
    const host = parsed.hostname.toLowerCase();

    if (
      LEGACY_HOSTS.includes(host) ||
      host.endsWith(".roseout.com") ||
      parsed.origin.toLowerCase() === "http://theouthaven.com" ||
      parsed.origin.toLowerCase() === "https://theouthaven.com"
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

export function getCanonicalAppUrl(): string {
  return normalizeSiteUrl(
    process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.APP_URL ||
      CANONICAL_SITE_URL,
  );
}
