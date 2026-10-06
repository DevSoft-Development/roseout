import fs from "node:fs";
import path from "node:path";

const bridge = fs.readFileSync(
  path.join(process.cwd(), "mobile/lib/pos/hardware/native-bridge.ts"),
  "utf8",
);

for (const token of [
  "NativeModules.ThePosHavenHardware",
  "scanLocalDevices",
  "sendTcp",
  "NativePosLocalDiscoveryProvider",
  "NativePosTcpTransport",
  "_printer._tcp",
  "CHANGE_WIFI_MULTICAST_STATE",
  "pos_native_hardware_bridge_unavailable",
]) {
  if (!bridge.includes(token)) {
    throw new Error(`POS native hardware bridge regression missing: ${token}`);
  }
}

if (bridge.includes("expo-")) {
  throw new Error("POS native hardware bridge must not depend on Expo hardware APIs.");
}

console.log("POS native hardware bridge contract passed.");
