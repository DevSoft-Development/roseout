export function getPlatformWebsiteDomain(websiteId: string) {
  const suffix = (process.env.NEXT_PUBLIC_WEBSITE_PLATFORM_DOMAIN_SUFFIX || process.env.WEBSITE_PLATFORM_DOMAIN_SUFFIX || "sites.theouthaven.com")
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
  const shortId = String(websiteId || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  if (!shortId) throw new Error("invalid_website_id");
  return `site-${shortId}.${suffix}`;
}

export function getWebsiteLiveUrl(website: { id: string; domain?: string | null }) {
  const host = website.domain?.trim().toLowerCase() || getPlatformWebsiteDomain(website.id);
  return `https://${host}`;
}
