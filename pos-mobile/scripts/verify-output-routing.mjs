import fs from "node:fs";

const routing = fs.readFileSync("lib/output/routing.ts", "utf8");
const store = fs.readFileSync("lib/output/route-store.ts", "utf8");

for (const marker of [
  '"cash_drawer"',
  "PosLocalEndpointResolver",
  "candidate.deviceId",
  "selectPosOutputRoutes",
  "openCashDrawer",
  "0x1b, 0x70",
  "pos_output_route_failed",
]) {
  if (!routing.includes(marker)) {
    throw new Error(`POS output routing missing marker: ${marker}`);
  }
}

if (/host:\s*["']\d+\.\d+\.\d+\.\d+/.test(routing) || /host:\s*["']\d+\.\d+\.\d+\.\d+/.test(store)) {
  throw new Error("POS output routes must never hard-code IP addresses.");
}

if (store.includes("host") || store.includes("port")) {
  throw new Error("Persisted output routes must store device identity, not network addresses.");
}

console.log("ThePOSHaven role-based output routing verified.");
