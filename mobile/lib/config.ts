const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");

export const mobileConfig = {
  apiBaseUrl: trimTrailingSlash(
    process.env.EXPO_PUBLIC_API_BASE_URL || "https://theouthaven.com/api/mobile/v1",
  ),
  siteUrl: trimTrailingSlash(
    process.env.EXPO_PUBLIC_SITE_URL || "https://theouthaven.com",
  ),
  shortLinkBaseUrl: trimTrailingSlash(
    process.env.EXPO_PUBLIC_SHORT_LINK_BASE_URL || "https://outhvn.com",
  ),
} as const;
