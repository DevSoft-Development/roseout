import Constants from "expo-constants";

export type RuntimePatch = {
  schemaVersion: 1;
  runtimeVersion: string;
  patchVersion: string;
  values: Record<string, string | number | boolean>;
};

const PATCH_URL = "https://theouthaven.com/api/mobile/runtime-patch";
const REQUEST_TIMEOUT_MS = 4000;

function isRuntimePatch(value: unknown): value is RuntimePatch {
  if (!value || typeof value !== "object") return false;
  const patch = value as Partial<RuntimePatch>;
  return (
    patch.schemaVersion === 1 &&
    typeof patch.runtimeVersion === "string" &&
    typeof patch.patchVersion === "string" &&
    !!patch.values &&
    typeof patch.values === "object" &&
    !Array.isArray(patch.values)
  );
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

    if (!response.ok) return null;

    const patch = (await response.json()) as unknown;
    if (!isRuntimePatch(patch)) return null;

    const runtimeVersion = String(Constants.expoConfig?.runtimeVersion ?? "");
    if (!runtimeVersion || patch.runtimeVersion !== runtimeVersion) return null;

    return patch;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function patchString(
  patch: RuntimePatch | null,
  key: string,
  fallback: string,
): string {
  const value = patch?.values[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}
