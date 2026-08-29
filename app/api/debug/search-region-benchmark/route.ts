import { handleGeneratePost } from "@/lib/search/public-api/controller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sfo1";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json({ error: "preview_only" }, { status: 404 });
  }

  const request = new Request("https://preview.internal/api/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      input: "dinner then bowling in Forest Hills, walking distance",
      selectedSearchLane: "auto",
      timezone: "America/New_York",
      useCurrentLocation: false,
      guidedFlow: "guided_create_v1",
      debug: true,
    }),
  });

  return handleGeneratePost(request);
}
