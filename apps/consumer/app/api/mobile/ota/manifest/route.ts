import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTA_BASE_URL = "https://updates.theouthaven.com";

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const platform = request.headers.get("expo-platform") || url.searchParams.get("platform");
  const runtimeVersion =
    request.headers.get("expo-runtime-version") ||
    url.searchParams.get("runtime-version") ||
    "";
  const channel =
    request.headers.get("expo-channel-name") ||
    url.searchParams.get("channel") ||
    "production";

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
    return new Response(null, {
      status: 204,
      headers: responseHeaders(bucket),
    });
  }

  const pointer = (await pointerResponse.json()) as {
    runtimeVersion?: string;
    releaseSha?: string;
    rolloutPercentage?: number;
    expoManifestPath?: string;
  };

  if (
    pointer.runtimeVersion !== runtimeVersion ||
    typeof pointer.rolloutPercentage !== "number" ||
    bucket >= pointer.rolloutPercentage ||
    !pointer.expoManifestPath
  ) {
    return new Response(null, {
      status: 204,
      headers: responseHeaders(bucket),
    });
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

  const manifest = await manifestResponse.text();
  return new Response(manifest, {
    status: 200,
    headers: {
      ...responseHeaders(bucket),
      "content-type": "application/expo+json",
    },
  });
}
