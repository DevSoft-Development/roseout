#!/usr/bin/env node
/** Read-only public consumer retrieval check for the first LI V2 bootstrap location.
 * This verifies customer-visible results, NOT authenticated internal Search V3 lane provenance.
 */
const LOCATION_ID = "0f9c90fa-c73a-4d8b-970d-8c51bec9e968";
const endpoint = "https://theouthaven.com/api/explore/search";
const url = new URL(endpoint);
url.searchParams.set("q", "Superiority Burger");
url.searchParams.set("kind", "restaurants");
url.searchParams.set("limit", "96");
const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30000) });
if (!response.ok) throw Error("Public consumer search returned HTTP " + response.status);
const payload = await response.json();
const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.results) ? payload.results : [];
const found = items.some((item) => item?.id === LOCATION_ID || item?.location_id === LOCATION_ID || item?.locationId === LOCATION_ID);
if (!found) throw Error("Public consumer search did not return the expected TOH ID; no claim of Search V3 certification");
console.log(JSON.stringify({ publicConsumerRetrievalCertified: true, authenticatedSearchV3Certified: false, locationId: LOCATION_ID, httpStatus: response.status }));
