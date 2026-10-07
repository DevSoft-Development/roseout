import fs from "node:fs";

const source = fs.readFileSync("lib/device/identity.ts", "utf8");

for (const marker of [
  "SecureStore",
  "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  "getOrCreatePosInstallationId",
  "PosClaimTransport",
  "claimPosDevice",
  "credential",
  "clearPosClaimSession",
]) {
  if (!source.includes(marker)) {
    throw new Error(`POS device identity runtime missing marker: ${marker}`);
  }
}

if (source.includes("service_role") || source.includes("SUPABASE_SERVICE_ROLE_KEY")) {
  throw new Error("POS mobile runtime must never embed privileged server credentials.");
}

console.log("ThePOSHaven secure device identity runtime verified.");
