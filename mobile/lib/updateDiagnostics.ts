// Expo wire-format verification publication: no runtime behavior change.
import * as Updates from "expo-updates";
import { trackMobileEvent } from "@/lib/analytics";
import { captureMobileError } from "@/lib/observability";

const MAX_LOG_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ERROR_ENTRIES = 20;
let started = false;

export async function reportUpdateDiagnostics() {
  if (started) return;
  started = true;

  try {
    const entries = await Updates.readLogEntriesAsync(MAX_LOG_AGE_MS);
    const failures = entries
      .filter((entry) => entry.level === "error" || entry.level === "fatal")
      .slice(-MAX_ERROR_ENTRIES);

    if (!failures.length) return;

    await Promise.allSettled(
      failures.map((entry) =>
        trackMobileEvent("mobile_update_diagnostic", {
          screen: "startup",
          dedupeKey: [
            "expo-update",
            entry.timestamp,
            entry.code,
            entry.updateId || "none",
            entry.assetId || "none",
          ].join(":"),
          metadata: {
            timestamp: entry.timestamp,
            code: entry.code,
            level: entry.level,
            message: entry.message,
            update_id: entry.updateId || null,
            asset_id: entry.assetId || null,
            stacktrace: entry.stacktrace?.slice(0, 20) || [],
            current_update_id: Updates.updateId || null,
            runtime_version: Updates.runtimeVersion || null,
            embedded_launch: Updates.isEmbeddedLaunch,
          },
        }),
      ),
    );

    for (const entry of failures) {
      captureMobileError(
        new Error(`expo-updates ${entry.code}: ${entry.message}`),
        {
          operation: "expo_updates_native_log",
          timestamp: entry.timestamp,
          code: entry.code,
          level: entry.level,
          updateId: entry.updateId || null,
          assetId: entry.assetId || null,
          stacktrace: entry.stacktrace?.slice(0, 20) || [],
          currentUpdateId: Updates.updateId || null,
          runtimeVersion: Updates.runtimeVersion || null,
          embeddedLaunch: Updates.isEmbeddedLaunch,
        },
      );
    }

    if (__DEV__) {
      console.warn("[expo-updates] captured native failures", failures);
    }
  } catch (error) {
    captureMobileError(error, { operation: "read_expo_updates_native_logs" });
  }
}
