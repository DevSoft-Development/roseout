export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      schemaVersion: 1,
      runtimeVersion: "2",
      patchVersion: "embedded-patch-proof-1",
      values: {
        "home.footerBadge": "patch-layer active",
      },
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    },
  );
}
