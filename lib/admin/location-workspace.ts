export const LOCATION_WORKSPACE_TABS = [
  { id: "overview", label: "Overview", legacyTab: "overview" },
  { id: "profile", label: "Profile", legacyTab: "profile" },
  { id: "menu", label: "Menu", legacyTab: "menu-packages" },
  { id: "operations", label: "Operations", legacyTab: "reservations" },
  { id: "growth", label: "Growth", legacyTab: "marketing-studio" },
  { id: "communication", label: "Communication", legacyTab: "communication" },
  { id: "activity", label: "Activity", legacyTab: "logs" },
  { id: "settings", label: "Settings", legacyTab: "settings" },
] as const;

export type LocationWorkspaceTab = (typeof LOCATION_WORKSPACE_TABS)[number]["id"];

const LEGACY_TO_WORKSPACE: Record<string, LocationWorkspaceTab> = {
  overview: "overview",
  profile: "profile",
  owner: "profile",
  branding: "profile",
  offerings: "profile",
  listing: "profile",
  photos: "profile",
  seo: "profile",
  "menu-packages": "menu",
  menu: "menu",
  reservations: "operations",
  claims: "operations",
  "qr-codes": "operations",
  support: "operations",
  "partner-launch": "growth",
  offers: "growth",
  "vip-list": "growth",
  "event-leads": "growth",
  "reviews-feedback": "growth",
  "marketing-studio": "growth",
  analytics: "growth",
  communication: "communication",
  messaging: "communication",
  notifications: "communication",
  logs: "activity",
  settings: "settings",
  plan: "settings",
};

export function normalizeLocationWorkspaceTab(value?: string | null): LocationWorkspaceTab {
  const normalized = String(value || "overview").trim().toLowerCase();
  if (LOCATION_WORKSPACE_TABS.some((tab) => tab.id === normalized)) {
    return normalized as LocationWorkspaceTab;
  }
  return LEGACY_TO_WORKSPACE[normalized] || "overview";
}

export function getLocationWorkspaceHref(locationId: string, tab: LocationWorkspaceTab = "overview") {
  return getLegacyCrmHref(locationId, tab);
}

export function getLegacyCrmHref(locationId: string, tab: LocationWorkspaceTab) {
  const definition = LOCATION_WORKSPACE_TABS.find((item) => item.id === tab) || LOCATION_WORKSPACE_TABS[0];
  return `/admin/dashboard/crm/${encodeURIComponent(locationId)}?tab=${definition.legacyTab}`;
}
