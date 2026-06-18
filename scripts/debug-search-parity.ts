import { normalizeCreateSearchRequest } from "../lib/search/normalizeCreateSearchRequest";

const queries = [
  "date night in Long Island near me",
  "date night near me",
  "date night in Long Island",
  "ice cream in Long Island near me",
  "coffee date in Long Island",
];

const fields = [
  "rawQuery",
  "cleanedQuery",
  "nearMeIntent",
  "typedLocationIntent",
  "resolvedMarket",
  "allowedMarkets",
  "explicitMarketRequested",
  "searchBackendUsed",
  "searchType",
  "wantsPairing",
  "needsRestaurant",
  "needsActivity",
];

let failures = 0;
for (const query of queries) {
  const publicRequest = normalizeCreateSearchRequest({ rawQuery: query, source: "public_create", body: { userLatitude: 40.7, userLongitude: -73.9 } });
  const adminRequest = normalizeCreateSearchRequest({ rawQuery: query, source: "admin_search_lab", body: { userLatitude: 40.7, userLongitude: -73.9 } });
  for (const field of fields) {
    const a = field in publicRequest ? (publicRequest as any)[field] : publicRequest.debugParity[field];
    const b = field in adminRequest ? (adminRequest as any)[field] : adminRequest.debugParity[field];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      failures += 1;
      console.error(`Mismatch for "${query}" field ${field}:`, { public_create: a, admin_search_lab: b });
    }
  }
  console.log(JSON.stringify({ query, canonical: publicRequest.debugParity }, null, 2));
}

if (failures > 0) {
  console.error(`${failures} parity assertion(s) failed.`);
  process.exit(1);
}

console.log("Search parity normalizer checks passed.");
