import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, any>;

const VALID_SOURCE_TABLES = new Set(["locations", "restaurants", "activities"]);

function parseBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === "true" || value === 1 || value === "1";
}

function parseIntWithBounds(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
  return { raw: value };
}

function safeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

async function handleGoogleEnrichmentPost(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager"]);
  if (auth.error) return auth.error;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const cronSecret = process.env.GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET || process.env.CRON_SECRET;

  if (!supabaseUrl || !cronSecret) {
    return Response.json(
      {
        success: false,
        error: "Missing Supabase URL or cron secret configuration.",
        debug: {
          hasSupabaseUrl: Boolean(supabaseUrl),
          hasGoogleLocationEnrichmentCronSecret: Boolean(process.env.GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET),
          hasCronSecret: Boolean(process.env.CRON_SECRET),
        },
      },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const sourceTable = VALID_SOURCE_TABLES.has(String(body.sourceTable))
    ? String(body.sourceTable)
    : "locations";

  const dryRun = parseBoolean(body.dryRun, true);
  const requestedLimit = parseIntWithBounds(body.limit, 10, 1, dryRun ? 100 : 25);
  const limit = dryRun ? requestedLimit : Math.min(25, requestedLimit);
  const confirmApply = parseBoolean(body.confirmApply, false);

  if (!dryRun && !confirmApply) {
    return Response.json(
      { success: false, error: "confirmApply must be true before running a write batch." },
      { status: 400 },
    );
  }

  const payload = {
    sourceTable,
    limit,
    dryRun,
    onlyWeakSearchTerms: parseBoolean(body.onlyWeakSearchTerms, true),
    onlyMissingPlaceId: parseBoolean(body.onlyMissingPlaceId, false),
    force: parseBoolean(body.force, false),
    enableFoodProbe: parseBoolean(body.enableFoodProbe, false),
    maxFoodProbesPerRow: parseIntWithBounds(body.maxFoodProbesPerRow, 2, 1, 3),
    confirmApply,
    applyHighConfidence: false,
  };

  const response = await fetch(`${supabaseUrl}/functions/v1/google-location-enrichment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": cronSecret,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  let parsed: unknown = text;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  const resultRecord = asRecord(parsed);

  if (!response.ok || resultRecord.success === false || resultRecord.error) {
    return Response.json(
      {
        success: false,
        error:
          resultRecord.error ||
          resultRecord.message ||
          resultRecord.raw ||
          `Google enrichment function failed. Status: ${response.status}`,
        debug: {
          edgeStatus: response.status,
          edgeStatusText: response.statusText,
          edgePayload: resultRecord,
          requestPayload: payload,
          hasSupabaseUrl: Boolean(supabaseUrl),
          hasCronSecret: Boolean(cronSecret),
        },
      },
      { status: response.ok ? 500 : response.status },
    );
  }

  return Response.json({
    success: true,
    ...payload,
    ...resultRecord,
    result: resultRecord.result || resultRecord,
    debug: {
      edgeStatus: response.status,
      edgeStatusText: response.statusText,
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasCronSecret: Boolean(cronSecret),
    },
  });
}

export async function POST(req: Request) {
  try {
    return await handleGoogleEnrichmentPost(req);
  } catch (error) {
    const safe = safeError(error);
    console.error("Google enrichment admin route crashed", error);

    return Response.json(
      {
        success: false,
        error: safe.message || "Google enrichment admin route crashed.",
        debug: safe,
      },
      { status: 500 },
    );
  }
}
