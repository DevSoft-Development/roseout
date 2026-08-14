function platformSuffix() {
  return (process.env.NEXT_PUBLIC_WEBSITE_PLATFORM_DOMAIN_SUFFIX || process.env.WEBSITE_PLATFORM_DOMAIN_SUFFIX || "theouthaven.com")
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
}

export function getPlatformWebsiteDomainSuffix() {
  return platformSuffix();
}

export function normalizeCustomWebsiteDomain(value: string) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;

  let hostname = raw;
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    hostname = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }

  hostname = hostname.replace(/^www\./, "").replace(/\.$/, "");
  if (hostname.length > 253) return null;
  if (hostname === platformSuffix() || hostname.endsWith(`.${platformSuffix()}`)) return null;
  if (!hostname.includes(".")) return null;
  if (!/^[a-z0-9.-]+$/.test(hostname)) return null;
  if (hostname.split(".").some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) return null;
  return hostname;
}

export function getPlatformWebsiteDomainBase(locationName?: string | null, websiteId?: string | null) {
  const cleanName = String(locationName || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 54);

  if (cleanName) return cleanName;

  const fallback = String(websiteId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  if (!fallback) throw new Error("invalid_website_id");
  return `site${fallback}`;
}

export function buildPlatformWebsiteDomain(locationName: string | null | undefined, websiteId: string, sequence = 0) {
  const base = getPlatformWebsiteDomainBase(locationName, websiteId);
  const suffix = sequence > 0 ? String(sequence).padStart(2, "0") : "";
  return `${base}${suffix}.${platformSuffix()}`;
}

export function getWebsiteLiveUrl(website: { domain?: string | null; platform_domain?: string | null }) {
  const host = website.domain?.trim().toLowerCase() || website.platform_domain?.trim().toLowerCase() || null;
  return host ? `https://${host}` : null;
}
