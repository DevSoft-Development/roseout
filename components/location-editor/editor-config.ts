import type { buildLocationEditorLinks } from "@/lib/location-editor-links";

type Links = ReturnType<typeof buildLocationEditorLinks>;

export const cleanEditorHashNav = [
  { label: "Overview / Details", href: "#details", sectionId: "details" },
  { label: "Public Profile", href: "#public-profile", sectionId: "public-profile" },
  { label: "Photos", href: "#photos", sectionId: "photos" },
  { label: "Hours", href: "#hours", sectionId: "hours" },
] as const;

export function getCleanEditorActions(links: Links) {
  return [
    { label: "Back to Location Dashboard", href: links.dashboard, kind: "primary" },
    { label: "Public Preview", href: links.publicPage, kind: "link" },
    { label: "Menu Editor", href: links.menuEditor, kind: "link" },
    { label: "Public Menu", href: links.menuViewer, kind: "link" },
    { label: "Reservations / Reserve Dashboard", href: links.reserveDashboard, kind: "link" },
    { label: "QR Tools", href: links.qrTools, kind: "link" },
    { label: "Analytics", href: links.analytics, kind: "link" },
    { label: "CRM", href: links.crm, kind: "link" },
  ] as const;
}

export function getCleanEditorNavItems(links: Links) {
  return [...cleanEditorHashNav, ...getCleanEditorActions(links)] as const;
}
