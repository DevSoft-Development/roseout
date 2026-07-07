export function reserveQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });

  const value = query.toString();
  return value ? `?${value}` : "";
}

export function appendReserveActingContext(
  url: string,
  context: Record<string, string | undefined> = {},
) {
  const [path, queryString = ""] = url.split("?");
  const query = new URLSearchParams(queryString);

  if (context.adminLocationId) query.set("adminLocationId", context.adminLocationId);
  if (context.type) query.set("type", context.type);
  if (context.demo) query.set("demo", context.demo);
  if (context.fromDemoCenter) query.set("fromDemoCenter", context.fromDemoCenter);

  const value = query.toString();
  return `${path}${value ? `?${value}` : ""}`;
}

export function getReserveDashboardUrl(
  tab = "today",
  section?: string,
  context: Record<string, string | undefined> = {},
) {
  return `/reserve/dashboard${reserveQuery({ ...context, tab, section })}`;
}

export function getLocationDashboardUrl(
  locationId?: string,
  type?: string,
  context: Record<string, string | undefined> = {},
) {
  return `/locations/dashboard${reserveQuery({
    ...context,
    locationId,
    type: type || undefined,
  })}`;
}

type ReserveEmbedOptions = {
  preview?: boolean;
  type?: string;
};

export function getReserveEmbedUrl(locationId?: string, options: ReserveEmbedOptions = {}) {
  return locationId
    ? `/embed/reservations/${encodeURIComponent(locationId)}${reserveQuery({
        preview: options.preview ? "1" : undefined,
        type: options.type,
      })}`
    : "";
}

export function getReserveQrUrl(locationId?: string, type?: string) {
  return locationId
    ? getReserveDashboardUrl("settings", "qr", {
        locationId,
        type: type || undefined,
      })
    : "";
}

export function getReserveAdminQrUrl(locationId?: string, type?: string) {
  return getReserveQrUrl(locationId, type);
}

export function getReserveBookingUrl(locationId?: string, type?: string) {
  return getReserveLocationBookingUrl(locationId, type);
}

export function getReserveLocationBookingUrl(locationId?: string, type?: string) {
  return locationId
    ? `/reserve/location/${encodeURIComponent(locationId)}${reserveQuery({
        type: type || undefined,
      })}`
    : "";
}

export function getReservePublicProfileUrl(locationId?: string) {
  return locationId ? `/reserve/location/${encodeURIComponent(locationId)}` : "";
}

type ReserveActionLinkInput = {
  locationId?: string;
  locationType?: string;
  adminLocationId?: string;
  isDemo?: boolean;
  demo?: string;
  fromDemoCenter?: string;
};

export function getReserveActionLinks({
  locationId,
  locationType,
  adminLocationId,
  isDemo,
  demo,
  fromDemoCenter,
}: ReserveActionLinkInput) {
  const context = {
    adminLocationId: adminLocationId || undefined,
    type: locationType || undefined,
    demo: demo || (isDemo ? "true" : undefined),
    fromDemoCenter: fromDemoCenter || undefined,
  };

  const embedSetupHref = locationId
    ? getReserveDashboardUrl("settings", "embed", {
        ...context,
        adminLocationId: adminLocationId || locationId,
      })
    : "";

  return {
    locationDashboardHref: getLocationDashboardUrl(locationId, locationType, context),
    bookingHref: getReserveLocationBookingUrl(locationId, locationType),
    embedHref: getReserveEmbedUrl(locationId, {
      preview: false,
      type: locationType,
    }),
    embedPreviewHref: getReserveEmbedUrl(locationId, {
      preview: true,
      type: locationType,
    }),
    embedSetupHref,
    qrHref: getReserveAdminQrUrl(locationId, locationType),
  };
}

export const getEmbedLink = getReserveEmbedUrl;
export const getQrLink = getReserveQrUrl;
export const getBookingLink = getReserveBookingUrl;