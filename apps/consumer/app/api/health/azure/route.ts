export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const payload = {
    ok: true,
    service: "theouthaven-consumer",
    runtime: "azure-container-apps",
    provider: process.env.PLATFORM_RUNTIME_PROVIDER || "azure-consumer",
    regionRole: process.env.PLATFORM_RUNTIME_REGION_ROLE || "primary",
    revision: process.env.PLATFORM_RUNTIME_GIT_SHA || "",
  };
  const body = JSON.stringify(payload);

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "content-length": String(Buffer.byteLength(body)),
      "x-theouthaven-health-revision": payload.revision,
      "x-theouthaven-region-role": payload.regionRole,
    },
  });
}
