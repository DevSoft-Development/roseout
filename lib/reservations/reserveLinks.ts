export function reserveQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const value = query.toString();
  return value ? `?${value}` : "";
}

export function appendReserveActingContext(url: string, context: Record<string, string | undefined> = {}) {
  const [path, queryString = ""] = url.split("?");
  const query = new URLSearchParams(queryString);
  if (context.adminLocationId) query.set("adminLocationId", context.adminLocationId);
  if (context.type) query.set("type", context.type);
  const value = query.toString();
  return `${path}${value ? `?${value}` : ""}`;
}

export function getReserveDashboardUrl(tab = "today", section?: string, context: Record<string, string | undefined> = {}) {
  return `/reserve/dashboard${reserveQuery({ ...context, tab, section })}`;
}

type ReserveEmbedOptions = { preview?: boolean; type?: string };

export function getReserveEmbedUrl(locationId?: string, options: ReserveEmbedOptions = {}) {
  return locationId
    ? `/embed/reservations/${encodeURIComponent(locationId)}${reserveQuery({ preview: options.preview ? "1" : undefined, type: options.type })}`
    : "";
}

export function getReserveQrUrl(locationId?: string) {
  return locationId ? `/business/dashboard/qr-codes?locationId=${encodeURIComponent(locationId)}&mode=reservations` : "";
}

export function getReserveAdminQrUrl(locationId?: string, type = "restaurant") {
  return locationId
    ? `/admin/dashboard/claim-qrs?locationId=${encodeURIComponent(locationId)}&type=${encodeURIComponent(type)}&mode=reservations`
    : "";
}

export function getReserveBookingUrl(locationId?: string, type = "restaurant") {
  return locationId ? `/reserve/${encodeURIComponent(type)}/${encodeURIComponent(locationId)}` : "";
}

export function getReserveLocationBookingUrl(locationId?: string, type = "restaurant") {
  return locationId
    ? `/reserve/location/${encodeURIComponent(locationId)}${reserveQuery({ type })}`
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
};

export function getReserveActionLinks({ locationId, locationType = "restaurant", adminLocationId, isDemo }: ReserveActionLinkInput) {
  const preview = Boolean(adminLocationId || isDemo);
  return {
    bookingHref: getReserveLocationBookingUrl(locationId, locationType),
    embedHref: getReserveEmbedUrl(locationId, { preview, type: locationType }),
    qrHref: preview ? getReserveAdminQrUrl(locationId, locationType) : getReserveQrUrl(locationId),
  };
}

export const getEmbedLink = getReserveEmbedUrl;
export const getQrLink = getReserveQrUrl;
export const getBookingLink = getReserveBookingUrl;
