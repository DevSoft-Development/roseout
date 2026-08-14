function platformSuffix() {
  return (process.env.NEXT_PUBLIC_WEBSITE_PLATFORM_DOMAIN_SUFFIX || process.env.WEBSITE_PLATFORM_DOMAIN_SUFFIX || "sites.theouthaven.com")
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
}

function slugifyLocationName(value?: string | null) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42)
    .replace(/-+$/g, "");
}

export function getPlatformWebsiteDomain(websiteId: string, locationName?: string | null) {
  const suffix = platformSuffix();
  const shortId = String(websiteId || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
  if (!shortId) throw new Error("invalid_website_id");

  const locationSlug = slugifyLocationName(locationName);
  const host = locationSlug ? `${locationSlug}-${shortId}` : `site-${shortId}`;
  return `${host}.${suffix}`;
}

export function getWebsiteLiveUrl(
  website: { id: string; domain?: string | null },
  locationName?: string | null,
) {
  const host = website.domain?.trim().toLowerCase() || getPlatformWebsiteDomain(website.id, locationName);
  return `https://${host}`;
}
