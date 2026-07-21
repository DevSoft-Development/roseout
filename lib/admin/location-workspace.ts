export const LOCATION_WORKSPACE_TAB_GROUPS = [
  {
    id: "overview",
    label: "Overview",
    defaultTab: "overview",
    tabs: [
      { id: "overview", label: "Overview" },
      { id: "partner-launch", label: "Partner Launch" },
      { id: "owner", label: "Owner" },
      { id: "plan", label: "Plan / Billing" },
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
    tabs: [
      { id: "menu-packages", label: "Packages" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    defaultTab: "reservations",
    tabs: [
      { id: "reservations", label: "Reservations" },
      { id: "claims", label: "Claims" },
      { id: "qr-codes", label: "QR Codes" },
      { id: "support", label: "Support" },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    defaultTab: "offers",
    tabs: [
      { id: "offers", label: "Offers" },
      { id: "vip-list", label: "VIP List" },
      { id: "event-leads", label: "Event Leads" },
      { id: "marketing-studio", label: "Marketing Studio" },
    ],
  },
  {
    id: "communications",
    label: "Communications",
    defaultTab: "communication",
    tabs: [
      { id: "communication", label: "Outreach" },
      { id: "messaging", label: "Messaging" },
      { id: "notifications", label: "Notifications" },
    ],
  },
  {
    id: "activity",
    label: "Activity",
    defaultTab: "analytics",
    tabs: [
      { id: "analytics", label: "Analytics" },
      { id: "reviews-feedback", label: "Reviews / Feedback" },
      { id: "logs", label: "Logs" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    defaultTab: "settings",
    tabs: [
      { id: "settings", label: "Settings" },
      { id: "seo", label: "SEO" },
    ],
  },
] as const;

export const LOCATION_WORKSPACE_TABS = LOCATION_WORKSPACE_TAB_GROUPS.map(({ id, label, defaultTab }) => ({
  id,
  label,
  legacyTab: defaultTab,
}));

export type LocationWorkspaceTab = (typeof LOCATION_WORKSPACE_TAB_GROUPS)[number]["id"];
export type LocationWorkspaceChildTab = (typeof LOCATION_WORKSPACE_TAB_GROUPS)[number]["tabs"][number]["id"];

const LEGACY_TO_WORKSPACE = LOCATION_WORKSPACE_TAB_GROUPS.reduce((acc, group) => {
  acc[group.id] = group.id;
  for (const tab of group.tabs) acc[tab.id] = group.id;
  return acc;
}, {} as Record<string, LocationWorkspaceTab>);

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
