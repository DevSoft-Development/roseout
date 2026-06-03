export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthMiles = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function walkingMinutesFromMiles(miles: number): number {
  return Math.round(miles * 20);
}

export function hasCoordinates(item: Record<string, unknown>): boolean {
  const lat = Number(item?.latitude);
  const lng = Number(item?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
}
