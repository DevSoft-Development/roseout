export const CRM_ENTERPRISE_SECTIONS = [
  { id: "overview", label: "Overview", tab: "overview" },
  { id: "profile", label: "Profile", tab: "profile" },
  { id: "photos", label: "Photos", tab: "photos" },
  { id: "search", label: "Search & Matching", tab: "listing" },
  { id: "publishability", label: "Publishability", tab: "listing" },
  { id: "menu", label: "Menu", tab: "menu-packages" },
] as const;

export type CrmEnterpriseSectionId = (typeof CRM_ENTERPRISE_SECTIONS)[number]["id"];

export function getCrmEnterpriseHref(locationId: string, tab: string) {
  return `/admin/dashboard/crm/${locationId}?tab=${tab}`;
}

export function getCrmEnterpriseActiveSection(tab?: string | null): CrmEnterpriseSectionId {
  switch ((tab || "overview").toLowerCase()) {
    case "profile":
      return "profile";
    case "photos":
      return "photos";
    case "listing":
    case "seo":
      return "search";
    case "menu":
    case "menu-packages":
    case "offerings":
      return "menu";
    default:
      return "overview";
  }
}
