#!/usr/bin/env node
/** Read-only authenticated Search V3 certification for the fixed first LI V2 bootstrap location. */
const LOCATION_ID = "0f9c90fa-c73a-4d8b-970d-8c51bec9e968";
const SEARCH_QUERY = "Superiority Burger";
const required = ["LI_E2E_SEARCH_URL", "LI_E2E_SEARCH_BEARER_TOKEN"];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) throw new Error("Missing authenticated Search V3 configuration: " + missing.join(", "));
const url = new URL(process.env.LI_E2E_SEARCH_URL);
if (url.protocol !== "https:") throw new Error("Authenticated Search V3 requires HTTPS");
const response = await fetch(url, {
  method: "POST",
  headers: {
    authorization: "Bearer " + process.env.LI_E2E_SEARCH_BEARER_TOKEN,
    "content-type": "application/json"
  },
  body: JSON.stringify({ query: SEARCH_QUERY }),
  signal: AbortSignal.timeout(20000)
});
if (!response.ok) throw new Error("Search V3 returned HTTP " + response.status);
const payload = await response.json();
if (!JSON.stringify(payload).includes(LOCATION_ID))
  throw new Error("Search V3 failed to retrieve the exact verified TOH location ID");
console.log(JSON.stringify({
  certified: true, locationId: LOCATION_ID, query: SEARCH_QUERY,
  searchHttpStatus: response.status, retrieval: "exact_toh_id"
}));
