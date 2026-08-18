export const LOCATION_WORKSPACE_TAB_GROUPS = [
  {
    id: "overview",
    label: "Overview",
    defaultTab: "overview",
    tabs: [
      { id: "overview", label: "Overview" },
      { id: "owner", label: "Owner" },
      { id: "plan", label: "Plan & Billing" },
    ],
  },
  {
    id: "profile",
    label: "Profile",
    defaultTab: "profile",
    tabs: [
      { id: "profile", label: "Profile" },
      { id: "photos", label: "Photos" },
      { id: "listing", label: "Listing" },
      { id: "branding", label: "Branding" },
      { id: "offerings", label: "Offerings" },
    ],
  },
  {
    id: "menu",
    label: "Menu",
    defaultTab: "menu-packages",
    tabs: [{ id: "menu-packages", label: "Packages" }],
  },
  {
    id: "operations",
    label: "Operations",
    defaultTab: "operations",
    tabs: [
      { id: "operations", label: "Overview" },
      { id: "reservations", label: "Reservations" },
      { id: "waitlist", label: "Waitlist" },
      { id: "walk-ins", label: "Walk-ins" },
      { id: "floor-resources", label: "Floor & Resources" },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    defaultTab: "growth-overview",
    tabs: [
      { id: "growth-overview", label: "Overview" },
      { id: "offers", label: "Offers" },
      { id: "vip-list", label: "VIP Audience" },
      { id: "event-leads", label: "Event Leads" },
      { id: "campaigns", label: "Campaigns" },
    ],
  },
  {
    id: "communications",
    label: "Communications",
    defaultTab: "communication",
    tabs: [
      { id: "communication", label: "Communications" },
      { id: "messaging", label: "Messaging" },
    ],
  },
  {
    id: "activity",
    label: "Activity",
    defaultTab: "analytics",
    tabs: [
      { id: "analytics", label: "Analytics" },
      { id: "reviews-feedback", label: "Reviews & Feedback" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    defaultTab: "settings",
    tabs: [{ id: "settings", label: "Settings" }],
  },
] as const;

export const LOCATION_WORKSPACE_TABS = LOCATION_WORKSPACE_TAB_GROUPS.map(({ id, label, defaultTab }) => ({
  id,
  label,
  legacyTab: defaultTab,
}));

export type LocationWorkspaceTab = (typeof LOCATION_WORKSPACE_TAB_GROUPS)[number]["id"];
export type LocationWorkspaceChildTab = (typeof LOCATION_WORKSPACE_TAB_GROUPS)[number]["tabs"][number]["id"];

const LEGACY_TO_WORKSPACE: Record<string, LocationWorkspaceTab> = {
  overview: "overview",
  "partner-launch": "overview",
  owner: "overview",
  plan: "overview",
  profile: "profile",
  photos: "profile",
  listing: "profile",
  branding: "profile",
  offerings: "profile",
  "menu-packages": "menu",
  menu: "menu",
  operations: "operations",
  reservations: "operations",
  waitlist: "operations",
  "walk-ins": "operations",
  "floor-resources": "operations",
  claims: "operations",
  "qr-codes": "operations",
  support: "operations",
  "growth-overview": "growth",
  offers: "growth",
  "vip-list": "growth",
  "event-leads": "growth",
  campaigns: "growth",
  "marketing-studio": "growth",
  conversion: "growth",
  "growth-settings": "growth",
  communication: "communications",
  messaging: "communications",
  notifications: "communications",
  analytics: "activity",
  "reviews-feedback": "activity",
  logs: "activity",
  settings: "settings",
  seo: "settings",
};

for (const group of LOCATION_WORKSPACE_TAB_GROUPS) {
  LEGACY_TO_WORKSPACE[group.id] = group.id;
  for (const tab of group.tabs) LEGACY_TO_WORKSPACE[tab.id] = group.id;
}

export function normalizeLocationWorkspaceTab(value?: string | null): LocationWorkspaceTab {
  const normalized = String(value || "overview").trim().toLowerCase();
  return LEGACY_TO_WORKSPACE[normalized] || "overview";
}

export function getLocationWorkspaceGroupForTab(tab?: string | null) {
  return LOCATION_WORKSPACE_TAB_GROUPS.find((group) => group.id === normalizeLocationWorkspaceTab(tab)) || LOCATION_WORKSPACE_TAB_GROUPS[0];
}

export function getLocationWorkspaceHref(locationId: string, tab: LocationWorkspaceTab = "overview") {
  return getLegacyCrmHref(locationId, tab);
}

export function getLegacyCrmHref(locationId: string, tab: LocationWorkspaceTab) {
  const definition = LOCATION_WORKSPACE_TAB_GROUPS.find((item) => item.id === tab) || LOCATION_WORKSPACE_TAB_GROUPS[0];
  return `/admin/dashboard/crm/${encodeURIComponent(locationId)}?tab=${definition.defaultTab}`;
}
