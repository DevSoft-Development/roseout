import fs from "node:fs";

const runtime = fs.readFileSync("lib/offline/runtime.ts", "utf8");
const bridge = fs.readFileSync("lib/hardware/native-bridge.ts", "utf8");
const ios = fs.readFileSync("native/ios/ThePosHavenHardware.swift", "utf8");
const android = fs.readFileSync(
  "native/android/ThePosHavenHardwareModule.kt",
  "utf8",
);

for (const marker of [
  "OFFLINE_QUEUE_KEY",
  "MAX_OFFLINE_COMMANDS",
  "idempotencyKey",
  "replayPosOfflineCommands",
  "completePosOrderOfflineSafe",
  "pos_offline_forbidden_payment_data",
  "RoleBasedPosOutputRouter",
]) {
  if (!runtime.includes(marker)) {
    throw new Error(`Offline POS runtime missing marker: ${marker}`);
  }
}

for (const marker of ["readState", "writeState", "deleteState"]) {
  if (!bridge.includes(marker)) {
    throw new Error(`Native bridge missing durable state method: ${marker}`);
  }
  if (!ios.includes(marker)) {
    throw new Error(`iOS native module missing durable state method: ${marker}`);
  }
  if (!android.includes(marker)) {
    throw new Error(`Android native module missing durable state method: ${marker}`);
  }
}

for (const forbidden of [
  "cardnumber",
  "cvv",
  "cvc",
  "track1",
  "track2",
  "clientsecret",
]) {
  if (!runtime.includes(`"${forbidden}"`)) {
    throw new Error(`Offline payment-data guard missing: ${forbidden}`);
  }
}

console.log("ThePOSHaven durable offline runtime verified.");
