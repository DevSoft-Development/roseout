import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTA_BASE_URL = "https://updates.theouthaven.com";

type ExpoAsset = {
  hash?: string;
  key: string;
  contentType: string;
  fileExtension?: string;
  url: string;
};

type ExpoManifest = {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: ExpoAsset;
  assets: ExpoAsset[];
  metadata: Record<string, string>;
  extra: Record<string, unknown>;
};

type MultipartPart = {
  name: "manifest" | "extensions" | "directive";
  contentType: "application/json" | "application/expo+json";
  body: string;
};

function responseHeaders(bucket: number) {
  return {
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
    "cache-control": "private, max-age=0",
    "expo-server-defined-headers": `toh-rollout-bucket=${bucket}`,
  };
}

function stableBucket(seed: string) {
  const digest = createHash("sha256").update(seed).digest();
  return digest.readUInt32BE(0) % 100;
}

function parseBucket(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 99 ? parsed : null;
}

function multipartResponse(parts: MultipartPart[], bucket: number) {
  if (parts.length === 0) {
    return new Response(null, {
      status: 204,
      headers: responseHeaders(bucket),
    });
  }

  const boundarySeed = parts
    .map((part) => `${part.name}:${part.body}`)
    .join("|");
  const boundary = `expo-${createHash("sha256")
    .update(boundarySeed)
    .digest("hex")
    .slice(0, 24)}`;

  const body = [
    ...parts.flatMap((part) => [
      `--${boundary}`,
      `content-disposition: form-data; name="${part.name}"`,
      `content-type: ${part.contentType}; charset=utf-8`,
      "",
      part.body,
    ]),
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return new Response(body, {
    status: 200,
    headers: {
      ...responseHeaders(bucket),
      "content-type": `multipart/mixed; boundary=${boundary}`,
    },
  });
}

function directiveResponse(
  directive: Record<string, unknown>,
  bucket: number,
) {
  return multipartResponse(
    [
      {
        name: "directive",
        contentType: "application/json",
        body: JSON.stringify(directive),
      },
    ],
    bucket,
  );
}

function updateResponse(manifest: ExpoManifest, bucket: number) {
  const assetRequestHeaders: Record<string, Record<string, string>> = {};

  for (const asset of [manifest.launchAsset, ...(manifest.assets || [])]) {
    assetRequestHeaders[asset.key] = {};
  }

  return multipartResponse(
    [
      {
        name: "manifest",
        contentType: "application/json",
        body: JSON.stringify(manifest),
      },
      {
        name: "extensions",
        contentType: "application/json",
        body: JSON.stringify({ assetRequestHeaders }),
      },
    ],
    bucket,
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const protocolVersion = request.headers.get("expo-protocol-version") || "1";
  const platform = request.headers.get("expo-platform") || url.searchParams.get("platform");
  const runtimeVersion =
    request.headers.get("expo-runtime-version") ||
    url.searchParams.get("runtime-version") ||
    "";
  const channel =
    request.headers.get("expo-channel-name") ||
    url.searchParams.get("channel") ||
    "production";

  if (protocolVersion !== "1") {
    return Response.json(
      { error: "unsupported_protocol_version", expected: "1" },
      { status: 406 },
    );
  }

  if (platform !== "ios" && platform !== "android") {
    return Response.json({ error: "unsupported_platform" }, { status: 400 });
  }
  if (!runtimeVersion) {
    return Response.json({ error: "runtime_version_required" }, { status: 400 });
  }
  if (!["internal", "preview", "production"].includes(channel)) {
    return Response.json({ error: "unsupported_channel" }, { status: 400 });
  }

  const persistedBucket = parseBucket(request.headers.get("toh-rollout-bucket"));
  const seed = [
    request.headers.get("expo-current-update-id") || "",
    request.headers.get("expo-embedded-update-id") || "",
    request.headers.get("x-forwarded-for") || "",
    request.headers.get("user-agent") || "",
  ].join("|");
  const bucket = persistedBucket ?? stableBucket(seed || "theouthaven");

  const pointerResponse = await fetch(
    `${OTA_BASE_URL}/channels/${channel}/${platform}.json?cb=${Date.now()}`,
    { cache: "no-store" },
  );
  if (!pointerResponse.ok) {
    return multipartResponse([], bucket);
  }

  const pointer = (await pointerResponse.json()) as {
    runtimeVersion?: string;
    releaseSha?: string;
    rolloutPercentage?: number;
    expoManifestPath?: string;
    rollbackToEmbedded?: boolean;
    rollbackCommitTime?: string;
  };

  if (pointer.runtimeVersion !== runtimeVersion) {
    return multipartResponse([], bucket);
  }

  if (pointer.rollbackToEmbedded === true) {
    const currentUpdateId = request.headers.get("expo-current-update-id");
    const embeddedUpdateId = request.headers.get("expo-embedded-update-id");

    if (currentUpdateId && embeddedUpdateId && currentUpdateId === embeddedUpdateId) {
      return directiveResponse({ type: "noUpdateAvailable" }, bucket);
    }

    return directiveResponse(
      {
        type: "rollBackToEmbedded",
        parameters: {
          commitTime: pointer.rollbackCommitTime || new Date(0).toISOString(),
        },
      },
      bucket,
    );
  }

  if (
    typeof pointer.rolloutPercentage !== "number" ||
    bucket >= pointer.rolloutPercentage ||
    !pointer.expoManifestPath
  ) {
    return multipartResponse([], bucket);
  }

  const manifestResponse = await fetch(
    `${OTA_BASE_URL}/${pointer.expoManifestPath}?cb=${Date.now()}`,
    { cache: "no-store" },
  );
  if (!manifestResponse.ok) {
    return Response.json(
      { error: "manifest_unavailable", releaseSha: pointer.releaseSha || null },
      { status: 503, headers: responseHeaders(bucket) },
    );
  }

  let manifest: ExpoManifest;
  try {
    manifest = (await manifestResponse.json()) as ExpoManifest;
  } catch {
    return Response.json(
      { error: "manifest_invalid_json", releaseSha: pointer.releaseSha || null },
      { status: 503, headers: responseHeaders(bucket) },
    );
  }

  if (
    !manifest.id ||
    !manifest.createdAt ||
    manifest.runtimeVersion !== runtimeVersion ||
    !manifest.launchAsset?.key ||
    !manifest.launchAsset?.url ||
    !Array.isArray(manifest.assets)
  ) {
    return Response.json(
      { error: "manifest_invalid", releaseSha: pointer.releaseSha || null },
      { status: 503, headers: responseHeaders(bucket) },
    );
  }

  const currentUpdateId = request.headers.get("expo-current-update-id");
  if (currentUpdateId && currentUpdateId === manifest.id) {
    return directiveResponse({ type: "noUpdateAvailable" }, bucket);
  }

  return updateResponse(manifest, bucket);
}
