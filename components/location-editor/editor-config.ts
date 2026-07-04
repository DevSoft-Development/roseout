import type { buildLocationEditorLinks } from "@/lib/location-editor-links";

type Links = ReturnType<typeof buildLocationEditorLinks>;

export const cleanEditorHashNav = [
  { label: "Details", href: "#details", sectionId: "details" },
  { label: "Public Profile", href: "#public-profile", sectionId: "public-profile" },
  { label: "Search Enhancements", href: "#search-enhancements", sectionId: "search-enhancements" },
  { label: "Recommended Details", href: "#recommended-details", sectionId: "recommended-details" },
  { label: "Photos", href: "#photos", sectionId: "photos" },
  { label: "Hours", href: "#hours", sectionId: "hours" },
  { label: "Menu", href: "#menu", sectionId: "menu" },
  { label: "QR Codes", href: "#qr-codes", sectionId: "qr-codes" },
  { label: "Analytics", href: "#analytics", sectionId: "analytics" },
  { label: "Marketing Center", href: "#marketing-center", sectionId: "marketing-center" },
] as const;

export function getCleanEditorActions(links: Links, showAdminQrAudit = false) {
  return [
    { label: "Back to Location Dashboard", href: links.dashboard, kind: "primary" },
    { label: "Public Preview", href: links.publicPage, kind: "link" },
    { label: "Open Public Menu", href: links.menuViewer, kind: "link" },
    { label: "Reservations / Reserve Dashboard", href: links.reserveDashboard, kind: "link" },
    ...(showAdminQrAudit ? [{ label: "Admin QR Audit", href: links.adminQrTools, kind: "link" as const }] : []),
    { label: "CRM", href: links.crm, kind: "link" },
  ] as const;
}

export function getCleanEditorNavItems(links: Links) {
  return [...cleanEditorHashNav, ...getCleanEditorActions(links)] as const;
}
