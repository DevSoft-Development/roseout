export type LocationType = "restaurants" | "activities";

export function locationContextType(type: LocationType) {
  return type === "activities" ? "activity" : "restaurant";
}

export function appendLocationContext(
  href: string,
  {
    type,
    id,
  }: {
    type: LocationType;
    id: string;
  },
) {
  if (!id) return href;

  const [baseWithQuery, hash] = href.split("#");
  const [base, existingQuery] = baseWithQuery.split("?");

  const params = new URLSearchParams(existingQuery || "");
  params.set("adminLocationId", id);
  params.set("locationId", id);
  params.set("type", locationContextType(type));
  params.set("demo", "1");
  params.set("fromDemoCenter", "1");

  return `${base}?${params.toString()}${hash ? `#${hash}` : ""}`;
}

export function buildLocationEditorLinks({
  type,
  locationId,
  canonicalId,
  sourceId,
  effectiveId,
}: {
  type: LocationType;
  locationId: string;
  canonicalId?: string;
  sourceId?: string | null;
  effectiveId?: string;
}) {
  const dashboardId = canonicalId || locationId;
  const hasCanonicalId = Boolean(canonicalId);
  const publicId = sourceId || effectiveId || canonicalId || locationId;
  const ownerType = locationContextType(type);
  const withDashboardContext = (href: string) =>
    appendLocationContext(href, { type, id: dashboardId });

  return {
    hasCanonicalId,
    dashboardId,
    dashboard: withDashboardContext("/locations/dashboard"),
    publicPage: `/locations/${type}/${publicId}`,
    crm: `/admin/dashboard/crm/${dashboardId}`,
    reserveDashboard: withDashboardContext("/reserve/dashboard"),
    reservations: withDashboardContext("/reserve/dashboard?tab=reservations"),
    reservationLayout: withDashboardContext("/reserve/dashboard?tab=settings&section=layout"),
    qrTools: withDashboardContext("/business/dashboard/qr-codes"),
    adminQrTools: `/admin/dashboard/claim-qrs?locationId=${encodeURIComponent(dashboardId)}&type=${encodeURIComponent(ownerType)}`,
    menuEditor: withDashboardContext("/business/dashboard/menu"),
    menuViewer: `/locations/${type}/${publicId}/menu`,
    photos: withDashboardContext("/business/dashboard/profile"),
    analytics: withDashboardContext("/business/dashboard/analytics"),
    vip: withDashboardContext("/business/dashboard/vip"),
    leads: withDashboardContext("/business/dashboard/leads"),
    reviews: withDashboardContext("/business/dashboard/reviews"),
    marketing: withDashboardContext("/business/dashboard/marketing-studio"),
    promotions: withDashboardContext("/business/dashboard/promotions"),
    messaging: withDashboardContext("/business/dashboard/messaging"),
    settings: withDashboardContext("/business/dashboard/settings"),
    branding: withDashboardContext("/business/dashboard/branding"),
  };
}
