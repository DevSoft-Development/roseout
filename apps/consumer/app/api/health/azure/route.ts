export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    service: "theouthaven-consumer",
    runtime: "azure-container-apps",
    provider: process.env.PLATFORM_RUNTIME_PROVIDER || "azure-consumer",
    regionRole: process.env.PLATFORM_RUNTIME_REGION_ROLE || "primary",
    revision: process.env.PLATFORM_RUNTIME_GIT_SHA || "",
  });
}
