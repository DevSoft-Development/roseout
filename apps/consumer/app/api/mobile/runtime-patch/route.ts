export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUNTIME_VERSION = "2";
const DEFAULT_PATCH_VERSION = "embedded-patch-proof-2";

const PATCHES = {
  embedded: {
    values: {},
  },
  "embedded-patch-proof-1": {
    values: {
      "home.footerBadge": "patch-layer active",
    },
  },
  "embedded-patch-proof-2": {
    values: {
      "home.footerBadge": "patch-layer v2",
    },
  },
} as const;

type PatchVersion = keyof typeof PATCHES;

function selectedPatchVersion(): PatchVersion {
  const configured = process.env.MOBILE_RUNTIME_PATCH_VERSION?.trim();
  if (configured && configured in PATCHES) {
    return configured as PatchVersion;
  }
  return DEFAULT_PATCH_VERSION;
}

function patchEnabled() {
  return process.env.MOBILE_RUNTIME_PATCH_ENABLED?.trim().toLowerCase() !== "false";
}

export async function GET() {
  const enabled = patchEnabled();
  const patchVersion = selectedPatchVersion();
  const selected = enabled ? PATCHES[patchVersion] : PATCHES.embedded;
  const effectivePatchVersion = enabled ? patchVersion : "embedded";

  return Response.json(
    {
      schemaVersion: 1,
      runtimeVersion: RUNTIME_VERSION,
      patchVersion: effectivePatchVersion,
      enabled,
      values: selected.values,
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store, max-age=0",
        "x-theouthaven-runtime-version": RUNTIME_VERSION,
        "x-theouthaven-patch-version": effectivePatchVersion,
        "x-theouthaven-patch-enabled": enabled ? "true" : "false",
      },
    },
  );
}
