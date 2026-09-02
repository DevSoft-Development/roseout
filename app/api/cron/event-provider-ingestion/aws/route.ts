import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { runEventProviderIngestion } from "@/lib/events/ingestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Provider = "ticketmaster" | "nyc_events" | "nyc_parks";

function safeError(error: unknown) {
  if (error instanceof TypeError && error.message === "Invalid URL") return "provider_url_invalid";
  return error instanceof Error ? error.message : "event_provider_ingestion_failed";
}

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  const providers: Provider[] = ["ticketmaster", "nyc_events", "nyc_parks"];
  const results: Array<Record<string, unknown>> = [];
  let hardFailure = false;

  for (const provider of providers) {
    try {
      const result = await runEventProviderIngestion({ providers: [provider] });
      results.push({
        provider,
        success: result.success,
        counts: result.counts,
        configuredProviders: result.configuredProviders,
        lifecycleError: result.lifecycleError,
        qualityError: result.qualityError,
        providers: result.providers,
      });
      if (result.lifecycleError || result.qualityError) hardFailure = true;
    } catch (error) {
      results.push({ provider, success: false, warning: safeError(error) });
    }
  }

  if (hardFailure) {
    return NextResponse.json(
      {
        ok: false,
        error: "event_ingestion_maintenance_failed",
        results,
      },
      { status: 500 },
    );
  }

  const degraded = results.some((result) => result.success === false);
  return NextResponse.json({
    ok: true,
    action: "event_provider_ingestion",
    degraded,
    warningCount: results.filter((result) => result.success === false).length,
    results,
  });
}
