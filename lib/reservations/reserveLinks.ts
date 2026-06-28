export function reserveQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const value = query.toString();
  return value ? `?${value}` : "";
}

export function getReserveDashboardUrl(tab = "today", section?: string, context: Record<string, string | undefined> = {}) {
  return `/reserve/dashboard${reserveQuery({ ...context, tab, section })}`;
}

export function getReserveEmbedUrl(locationId?: string) {
  return locationId ? `/embed/reservations/${encodeURIComponent(locationId)}` : "";
}

export function getReserveQrUrl(locationId?: string) {
  return locationId ? `/business/dashboard/qr-codes?locationId=${encodeURIComponent(locationId)}&mode=reservations` : "";
}

export function getReserveBookingUrl(locationId?: string, type = "restaurant") {
  return locationId ? `/reserve/${encodeURIComponent(type)}/${encodeURIComponent(locationId)}` : "";
}

export function getReservePublicProfileUrl(locationId?: string) {
  return locationId ? `/reserve/location/${encodeURIComponent(locationId)}` : "";
}

export const getEmbedLink = getReserveEmbedUrl;
export const getQrLink = getReserveQrUrl;
export const getBookingLink = getReserveBookingUrl;
