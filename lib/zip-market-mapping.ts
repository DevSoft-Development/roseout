export type ZipMarketMapping = {
  city: string;
  state: string;
  marketArea: string;
};

const ZIP_PREFIX_DEFAULTS: Array<{ prefix: string; mapping: ZipMarketMapping }> = [
  { prefix: "100", mapping: { city: "New York", state: "NY", marketArea: "Manhattan" } },
  { prefix: "101", mapping: { city: "New York", state: "NY", marketArea: "Manhattan" } },
  { prefix: "102", mapping: { city: "New York", state: "NY", marketArea: "Manhattan" } },
  { prefix: "103", mapping: { city: "Staten Island", state: "NY", marketArea: "Staten Island" } },
  { prefix: "104", mapping: { city: "Bronx", state: "NY", marketArea: "Bronx" } },
  { prefix: "111", mapping: { city: "Queens", state: "NY", marketArea: "Queens" } },
  { prefix: "112", mapping: { city: "Brooklyn", state: "NY", marketArea: "Brooklyn" } },
  { prefix: "113", mapping: { city: "Queens", state: "NY", marketArea: "Queens" } },
  { prefix: "114", mapping: { city: "Queens", state: "NY", marketArea: "Queens" } },
  { prefix: "115", mapping: { city: "Long Island", state: "NY", marketArea: "Long Island" } },
  { prefix: "116", mapping: { city: "Queens", state: "NY", marketArea: "Queens" } },
  { prefix: "070", mapping: { city: "Newark", state: "NJ", marketArea: "New Jersey" } },
  { prefix: "071", mapping: { city: "Newark", state: "NJ", marketArea: "New Jersey" } },
  { prefix: "072", mapping: { city: "Elizabeth", state: "NJ", marketArea: "New Jersey" } },
  { prefix: "073", mapping: { city: "Jersey City", state: "NJ", marketArea: "New Jersey" } },
  { prefix: "100", mapping: { city: "New York", state: "NY", marketArea: "Manhattan" } },
  { prefix: "331", mapping: { city: "Miami", state: "FL", marketArea: "Miami" } },
  { prefix: "332", mapping: { city: "Miami", state: "FL", marketArea: "Miami" } },
  { prefix: "333", mapping: { city: "Fort Lauderdale", state: "FL", marketArea: "Miami" } },
  { prefix: "900", mapping: { city: "Los Angeles", state: "CA", marketArea: "Los Angeles" } },
  { prefix: "303", mapping: { city: "Atlanta", state: "GA", marketArea: "Atlanta" } },
];

const ZIP_EXACT: Record<string, ZipMarketMapping> = {
  "10001": { city: "New York", state: "NY", marketArea: "Manhattan" },
  "11201": { city: "Brooklyn", state: "NY", marketArea: "Brooklyn" },
  "11101": { city: "Queens", state: "NY", marketArea: "Queens" },
};

export function getZipMarketMapping(zipCode: string): ZipMarketMapping | null {
  const normalized = zipCode.trim();
  if (!/^\d{5}$/.test(normalized)) return null;

  if (ZIP_EXACT[normalized]) return ZIP_EXACT[normalized];

  const prefixMatch = ZIP_PREFIX_DEFAULTS.find((entry) => normalized.startsWith(entry.prefix));
  return prefixMatch?.mapping || null;
}
