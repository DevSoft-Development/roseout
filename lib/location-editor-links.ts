export type LocationType = "restaurants" | "activities";

export type LocationEditorSearchParams =
  | URLSearchParams
  | Iterable<[string, string]>
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

const demoContextParamNames = [
  "demo",
  "fromDemoCenter",
  "adminLocationId",
  "locationId",
  "type",
] as const;

export function locationContextType(type: LocationType) {
  return type === "activities" ? "activity" : "restaurant";
}

function appendSearchParamValues(
  params: URLSearchParams,
  source: LocationEditorSearchParams,
  allowedNames = demoContextParamNames as readonly string[],
) {
  if (!source) return;

  const allowed = new Set(allowedNames);
  const append = (key: string, value: string | undefined) => {
    if (!allowed.has(key) || value === undefined) return;
    if (params.has(key)) return;
    params.set(key, value);
  };

  if (source instanceof URLSearchParams || Symbol.iterator in Object(source)) {
    for (const [key, value] of source as Iterable<[string, string]>) {
      append(key, value);
    }
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    append(key, Array.isArray(value) ? value[0] : value);
  }
}

export function appendLocationContext(
  href: string,
  {
    type,
    id,
    adminContext = false,
  }: {
    type: LocationType;
    id: string;
    adminContext?: boolean;
  },
) {
  if (!id) return href;

  return withDemoLocationContext(href, {
    type,
    locationId: id,
    adminLocationId: id,
    isDemoMode: adminContext,
    fromDemoCenter: adminContext,
  });
}

export function withDemoLocationContext(
  href: string,
  {
    type,
    locationId,
    adminLocationId,
    isDemoMode = false,
    fromDemoCenter = false,
    searchParams,
  }: {
    type: LocationType;
    locationId: string;
    adminLocationId?: string | null;
    isDemoMode?: boolean;
    fromDemoCenter?: boolean;
    searchParams?: LocationEditorSearchParams;
  },
) {
  if (!isDemoMode || !locationId) return href;

  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const hrefWithoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const queryIndex = hrefWithoutHash.indexOf("?");
  const base = queryIndex >= 0 ? hrefWithoutHash.slice(0, queryIndex) : hrefWithoutHash;
  const existingQuery = queryIndex >= 0 ? hrefWithoutHash.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(existingQuery);
  const contextId = adminLocationId || locationId;

  appendSearchParamValues(params, searchParams);
  params.set("demo", "1");
  params.set("fromDemoCenter", fromDemoCenter ? "1" : params.get("fromDemoCenter") || "1");
  params.set("adminLocationId", contextId);
  params.set("locationId", locationId);
  params.set("type", locationContextType(type));

  const queryString = params.toString();

  return `${base}${queryString ? `?${queryString}` : ""}${hash}`;
}

export function buildLocationEditorLinks({
  type,
  locationId,
  canonicalId,
  sourceId,
  effectiveId,
  dashboardId: explicitDashboardId,
  publicId: explicitPublicId,
  adminLocationId,
  adminContext = false,
  isDemoMode = adminContext,
  fromDemoCenter = false,
  searchParams,
}: {
  type: LocationType;
  locationId: string;
  canonicalId?: string;
  sourceId?: string | null;
  effectiveId?: string;
  dashboardId?: string;
  publicId?: string;
  adminLocationId?: string | null;
  adminContext?: boolean;
  isDemoMode?: boolean;
  fromDemoCenter?: boolean;
  searchParams?: LocationEditorSearchParams;
}) {
  const dashboardId = explicitDashboardId || canonicalId || locationId;
  const hasCanonicalId = Boolean(canonicalId);
  const publicId = explicitPublicId || sourceId || effectiveId || canonicalId || locationId;
  const ownerType = locationContextType(type);
  const demoLocationId = adminLocationId || dashboardId;
  const withContext = (href: string, id = demoLocationId) =>
    withDemoLocationContext(href, {
      type,
      locationId: id,
      adminLocationId: adminLocationId || id,
      isDemoMode,
      fromDemoCenter,
      searchParams,
    });
  const withDashboardContext = (href: string) => withContext(href, dashboardId);

  return {
    hasCanonicalId,
    dashboardId,
    dashboard: withDashboardContext("/locations/dashboard"),
    publicPage: withContext(`/locations/${type}/${publicId}`),
    edit: withContext(`/locations/${type}/${locationId}/edit`, dashboardId),
    crm: withContext(`/admin/dashboard/crm/${dashboardId}`, dashboardId),
    reserveDashboard: withDashboardContext("/reserve/dashboard"),
    reservations: withDashboardContext("/reserve/dashboard?tab=reservations"),
    reservationLayout: withDashboardContext("/reserve/dashboard?tab=settings&section=layout"),
    qrTools: withDashboardContext("/business/dashboard/qr-codes"),
    adminQrTools: withContext(`/admin/dashboard/claim-qrs?locationId=${encodeURIComponent(dashboardId)}&type=${encodeURIComponent(ownerType)}`, dashboardId),
    menuEditor: withDashboardContext("/business/dashboard/menu"),
    menuViewer: withContext(`/locations/${type}/${publicId}/menu`),
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
