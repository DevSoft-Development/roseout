import { processLocationEnrichmentRun } from "@/lib/location-data-quality/enrichment-runner";
import { processWebsiteHoursDiscovery } from "@/lib/location-data-quality/website-hours-discovery";
import { processPublishReadyCleanupCanary } from "@/lib/location-intelligence/cleanupWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function isPrivateAwsBackgroundRequest(request: Request) {
  return (
    String(process.env.PLATFORM_RUNTIME_PROVIDER || "").trim() === "aws-background"
    && request.headers.get("x-toh-aws-internal") === "managed-dispatch"
  );
}

function ensureGoogleEnrichmentKey() {
  if (!process.env.GOOGLE_PLACES_API_KEY?.trim()) {
    throw new Error("Google enrichment is not configured. Set GOOGLE_PLACES_API_KEY in production.");
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Seed one guarded cleanup batch only from the private AWS background runtime.
    // The SQS worker can switch later continuations to the cleanup-only target so
    // finishing this canary does not repeatedly execute paid catalog enrichment.
    const locationIntelligenceCleanup = isPrivateAwsBackgroundRequest(request)
      ? await processPublishReadyCleanupCanary(10)
      : null;

    ensureGoogleEnrichmentKey();
    const result = await processLocationEnrichmentRun();
    const websiteHours = await processWebsiteHoursDiscovery(5);
    return Response.json({ ...result, websiteHours, locationIntelligenceCleanup });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
