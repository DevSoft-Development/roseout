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

function parseMaybeJson(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function readableEdgeError(edgePayload: JsonRecord, fallback: string) {
  return String(
    edgePayload.error ||
      edgePayload.message ||
      asRecord(edgePayload.result).error ||
      asRecord(edgePayload.result).raw ||
      edgePayload.raw ||
      fallback,
  );
}

function normalizeEdgeResult(edgePayload: JsonRecord): JsonRecord {
  if (edgePayload.success === true && edgePayload.result !== undefined) {
    return asRecord(edgePayload.result);
  }

  return edgePayload;
}

async function handleGoogleEnrichmentPost(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager"]);
  if (auth.error) return auth.error;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const cronSecret = process.env.GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET || process.env.CRON_SECRET;

  const body = await req.json().catch(() => ({}));
  const sourceTable = VALID_SOURCE_TABLES.has(String(body.sourceTable))
    ? String(body.sourceTable)
    : "locations";

  const dryRun = parseBoolean(body.dryRun, true);
  const requestedLimit = parseIntWithBounds(body.limit, 10, 1, dryRun ? 100 : 25);
  const limit = dryRun ? requestedLimit : Math.min(25, requestedLimit);
  const confirmApply = parseBoolean(body.confirmApply, false);

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

  if (!supabaseUrl || !cronSecret) {
    return Response.json(
      {
        success: false,
        error: "Missing Supabase URL or cron secret configuration.",
        debug: {
          edgeStatus: null,
          edgeStatusText: null,
          edgePayload: null,
          requestPayload: payload,
          hasSupabaseUrl: Boolean(supabaseUrl),
          hasCronSecret: Boolean(cronSecret),
        },
      },
      { status: 500 },
    );
  }

  if (!dryRun && !confirmApply) {
    return Response.json(
      {
        success: false,
        error: "confirmApply must be true before running a write batch.",
        debug: {
          edgeStatus: null,
          edgeStatusText: null,
          edgePayload: null,
          requestPayload: payload,
          hasSupabaseUrl: Boolean(supabaseUrl),
          hasCronSecret: Boolean(cronSecret),
        },
      },
      { status: 400 },
    );
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/google-location-enrichment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": cronSecret,
    },
    body: JSON.stringify(payload),
  });

  const edgePayload = asRecord(parseMaybeJson(await response.text()));
  const normalizedResult = normalizeEdgeResult(edgePayload);
  const hasExplicitFailure =
    edgePayload.success === false || Boolean(edgePayload.error) || Boolean(normalizedResult.error);

  if (!response.ok || hasExplicitFailure) {
    const fallback = `Google enrichment function failed. Status: ${response.status}`;
    return Response.json(
      {
        success: false,
        error: readableEdgeError(edgePayload, fallback),
        debug: {
          edgeStatus: response.status,
          edgeStatusText: response.statusText,
          edgePayload,
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
    ...normalizedResult,
    result: normalizedResult,
    edgePayload,
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
        debug: {
          edgeStatus: null,
          edgeStatusText: null,
          edgePayload: null,
          requestPayload: null,
          hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
          hasCronSecret: Boolean(process.env.GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET || process.env.CRON_SECRET),
          ...safe,
        },
      },
      { status: 500 },
    );
  }
}
