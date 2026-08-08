import { processLocationEnrichmentRun } from "@/lib/location-data-quality/enrichment-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function ensureGoogleEnrichmentKey() {
  if (!process.env.GOOGLE_MAPS_API_KEY?.trim() && process.env.GOOGLE_PLACES_API_KEY?.trim()) {
    process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_PLACES_API_KEY.trim();
  }

  if (!process.env.GOOGLE_MAPS_API_KEY?.trim()) {
    throw new Error("Google enrichment is not configured. Set GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY in production.");
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    ensureGoogleEnrichmentKey();
    const result = await processLocationEnrichmentRun();
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
