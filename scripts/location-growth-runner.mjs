const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.IMPORT_SECRET || "";
async function call(path, body = {}) {
  console.log(`→ ${path}`, body);
  const res = await fetch(`${site}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(secret ? { "x-internal-import-secret": secret } : {}) }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(`${path} failed: ${data.error || res.statusText}`);
  console.log(`✓ ${path}`, data);
  return data;
}
async function main() {
  await call("/api/admin/cleanup-locations", { table: "locations", limit: 100, offset: 0 });
  for (const offset of [0, 1000, 2000, 3000]) {
    const nyc = await call("/api/admin/location-growth/import-nyc-restaurants", { limit: 1000, offset });
    if (!nyc.batchId) throw new Error("NYC import did not return a batchId; refusing to publish.");
    console.log(`NYC batch: ${nyc.batchId}`);
    await call("/api/admin/location-growth/dedupe", { batchId: nyc.batchId, mode: "staging" });
    await call("/api/admin/location-growth/publish", { batchId: nyc.batchId, limit: 250 });
    if ((nyc.seen || 0) < 1000) break;
  }
  const osm = await call("/api/admin/location-growth/import-osm-activities", { limit: 1000 });
  if (!osm.batchId) throw new Error("OSM import did not return a batchId; refusing to publish.");
  console.log(`OSM batch: ${osm.batchId}`);
  await call("/api/admin/location-growth/dedupe", { batchId: osm.batchId, mode: "staging" });
  await call("/api/admin/location-growth/publish", { batchId: osm.batchId, limit: 250 });
  await call("/api/admin/location-growth/enrich-high-value", { limit: 50 });
  await call("/api/admin/location-growth/generate-missing-qrs", { limit: 100 });
}
main().catch((error) => { console.error(error); process.exit(1); });
