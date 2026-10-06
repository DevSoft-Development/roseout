import fs from "node:fs";

const app = JSON.parse(fs.readFileSync("app.json", "utf8")).expo;
const plugin = fs.readFileSync("plugins/withThePosHavenHardware.js", "utf8");
const swift = fs.readFileSync("native/ios/ThePosHavenHardware.swift", "utf8");
const bridge = fs.readFileSync("lib/hardware/native-bridge.ts", "utf8");

const plugins = app.plugins || [];
if (!plugins.includes("./plugins/withThePosHavenHardware")) {
  throw new Error("ThePOSHaven iOS hardware config plugin is not enabled.");
}

for (const marker of [
  "withXcodeProject",
  "addSourceFile",
  "ThePosHavenHardware.swift",
]) {
  if (!plugin.includes(marker)) {
    throw new Error(`iOS hardware plugin missing marker: ${marker}`);
  }
}

for (const marker of [
  "@objc(ThePosHavenHardware)",
  "RCTBridgeModule",
  "NetServiceBrowser",
  "resolve(withTimeout:",
  "NWConnection",
  "sendTcp",
  "NI_NUMERICHOST",
]) {
  if (!swift.includes(marker)) {
    throw new Error(`iOS native hardware module missing marker: ${marker}`);
  }
}

if (!bridge.includes("NativeModules.ThePosHavenHardware")) {
  throw new Error("JavaScript hardware bridge is not wired to ThePosHavenHardware.");
}

console.log("ThePOSHaven iOS native hardware implementation verified.");
