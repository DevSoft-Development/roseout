import fs from "node:fs";

const app = JSON.parse(fs.readFileSync("app.json", "utf8")).expo;
const plugin = fs.readFileSync(
  "plugins/withThePosHavenAndroidHardware.js",
  "utf8",
);
const moduleSource = fs.readFileSync(
  "native/android/ThePosHavenHardwareModule.kt",
  "utf8",
);
const packageSource = fs.readFileSync(
  "native/android/ThePosHavenHardwarePackage.kt",
  "utf8",
);

if (!(app.plugins || []).includes("./plugins/withThePosHavenAndroidHardware")) {
  throw new Error("ThePOSHaven Android hardware config plugin is not enabled.");
}

for (const marker of [
  "withMainApplication",
  "withDangerousMod",
  "ThePosHavenHardwarePackage",
]) {
  if (!plugin.includes(marker)) {
    throw new Error(`Android hardware plugin missing marker: ${marker}`);
  }
}

for (const marker of [
  "NsdManager",
  "discoverServices",
  "resolveService",
  "createMulticastLock",
  "Socket()",
  "sendTcp",
]) {
  if (!moduleSource.includes(marker)) {
    throw new Error(`Android native hardware module missing marker: ${marker}`);
  }
}

if (!packageSource.includes("ThePosHavenHardwareModule")) {
  throw new Error("Android hardware ReactPackage is not wired.");
}

console.log("ThePOSHaven Android native hardware implementation verified.");
