// Backward-compatible export surface for callers that have not yet moved to
// the canonical Places API (New) importer. Keeping this file prevents stale
// imports from reintroducing the legacy Google Places endpoints.
export * from "./googlePlacesImportV2";
