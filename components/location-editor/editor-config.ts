import type { buildLocationEditorLinks } from "@/lib/location-editor-links";

type Links = ReturnType<typeof buildLocationEditorLinks>;

export const cleanEditorHashNav = [
  { label: "Overview", href: "#overview", sectionId: "overview" },
  { label: "Details", href: "#details", sectionId: "details" },
  { label: "Public Profile", href: "#public-profile", sectionId: "public-profile" },
  { label: "Search Enhancements", href: "#search-enhancements", sectionId: "search-enhancements" },
  { label: "Photos", href: "#photos", sectionId: "photos" },
  { label: "Hours", href: "#hours", sectionId: "hours" },
] as const;

export type CleanEditorSectionId =
  | (typeof cleanEditorHashNav)[number]["sectionId"]
  | "menu"
  | "qr-codes"
  | "analytics"
  | "marketing-center";

export function getCleanEditorActions(links: Links, showAdminQrAudit = false) {
  return [
    { label: "Back to Location Dashboard", href: links.dashboard, kind: "primary" },
    { label: "Open Menu Editor", href: links.menuEditor, kind: "link" },
    { label: "Reserve Dashboard", href: links.reserveDashboard, kind: "link" },
    { label: "QR Code Tools", href: links.qrTools, kind: "link" },
    { label: "Analytics", href: links.analytics, kind: "link" },
    { label: "Marketing Center", href: links.marketing, kind: "link" },
    { label: "Public Preview", href: links.publicPage, kind: "link" },
    { label: "Open Public Menu", href: links.menuViewer, kind: "link" },
    ...(showAdminQrAudit ? [{ label: "Admin QR Audit", href: links.adminQrTools, kind: "link" as const }] : []),
    { label: "CRM", href: links.crm, kind: "link" },
  ] as const;
}

export function getCleanEditorNavItems(links: Links) {
  return [...cleanEditorHashNav, ...getCleanEditorActions(links)] as const;
}
