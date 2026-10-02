import Constants from "expo-constants";
import { trackMobileEvent } from "@/lib/analytics";

export type RuntimePatchKey = "home.footerBadge";

export type RuntimePatch = {
  schemaVersion: 1;
  runtimeVersion: string;
  patchVersion: string;
  values: Partial<Record<RuntimePatchKey, string | number | boolean>>;
};

const PATCH_URL = "https://theouthaven.com/api/mobile/runtime-patch";
const REQUEST_TIMEOUT_MS = 4000;
const MAX_PATCH_VERSION_LENGTH = 128;
const MAX_PATCH_KEYS = 16;

const PATCH_VALIDATORS: Record<RuntimePatchKey, (value: unknown) => boolean> = {
  "home.footerBadge": (value) =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 64,
};

function reportPatchOutcome(
  outcome: string,
  metadata: Record<string, unknown> = {},
) {
  void trackMobileEvent("mobile_runtime_patch", {
    screen: "startup",
    dedupeKey: [
      "runtime-patch",
      String(Constants.expoConfig?.runtimeVersion ?? "unknown"),
      outcome,
      typeof metadata.patch_version === "string"
        ? metadata.patch_version
        : "none",
    ].join(":"),
    metadata: {
      outcome,
      runtime_version: String(Constants.expoConfig?.runtimeVersion ?? ""),
      ...metadata,
    },
  });
}

function validateRuntimePatch(
  value: unknown,
): { patch: RuntimePatch | null; reason: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { patch: null, reason: "invalid_object" };
  }

  const patch = value as Partial<RuntimePatch>;
  if (patch.schemaVersion !== 1) {
    return { patch: null, reason: "unsupported_schema" };
  }

  if (
    typeof patch.runtimeVersion !== "string" ||
    !patch.runtimeVersion.trim()
  ) {
    return { patch: null, reason: "invalid_runtime_version" };
  }

  if (
    typeof patch.patchVersion !== "string" ||
    !patch.patchVersion.trim() ||
    patch.patchVersion.length > MAX_PATCH_VERSION_LENGTH
  ) {
    return { patch: null, reason: "invalid_patch_version" };
  }

  if (
    !patch.values ||
    typeof patch.values !== "object" ||
    Array.isArray(patch.values)
  ) {
    return { patch: null, reason: "invalid_values" };
  }

  const entries = Object.entries(patch.values);
  if (entries.length > MAX_PATCH_KEYS) {
    return { patch: null, reason: "too_many_keys" };
  }

  for (const [key, entryValue] of entries) {
    if (!(key in PATCH_VALIDATORS)) {
      return { patch: null, reason: "unknown_key" };
    }

    const validator = PATCH_VALIDATORS[key as RuntimePatchKey];
    if (!validator(entryValue)) {
      return { patch: null, reason: "invalid_value" };
    }
  }

  return { patch: patch as RuntimePatch, reason: "accepted" };
}

export async function fetchRuntimePatch(): Promise<RuntimePatch | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(PATCH_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      reportPatchOutcome("http_error", { status: response.status });
      return null;
    }

    const payload = (await response.json()) as unknown;
    const result = validateRuntimePatch(payload);

    if (!result.patch) {
      const patchVersion =
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        typeof (payload as { patchVersion?: unknown }).patchVersion === "string"
          ? (payload as { patchVersion: string }).patchVersion
          : null;

      reportPatchOutcome("rejected", {
        reason: result.reason,
        patch_version: patchVersion,
      });
      return null;
    }

    const runtimeVersion = String(Constants.expoConfig?.runtimeVersion ?? "");
    if (!runtimeVersion || result.patch.runtimeVersion !== runtimeVersion) {
      reportPatchOutcome("rejected", {
        reason: "runtime_mismatch",
        patch_version: result.patch.patchVersion,
        patch_runtime_version: result.patch.runtimeVersion,
      });
      return null;
    }

    reportPatchOutcome("accepted", {
      patch_version: result.patch.patchVersion,
      key_count: Object.keys(result.patch.values).length,
    });
    return result.patch;
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"));
    reportPatchOutcome(timedOut ? "timeout" : "network_error");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function patchString(
  patch: RuntimePatch | null,
  key: RuntimePatchKey,
  fallback: string,
): string {
  const value = patch?.values[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}
