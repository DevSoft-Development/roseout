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

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager"]);
  if (auth.error) return auth.error;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const cronSecret = process.env.GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET || process.env.CRON_SECRET;

  if (!supabaseUrl || !cronSecret) {
    return Response.json(
      { success: false, error: "Missing Supabase URL or cron secret configuration." },
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

  if (payload.applyHighConfidence) {
    return Response.json(
      {
        success: false,
        error: "Auto-apply is disabled from the admin dashboard. Use review-only suggestions.",
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

  const text = await response.text();
  let result: unknown = text;

  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      result = text;
    }
  }

  const resultRecord: JsonRecord =
    result && typeof result === "object" && !Array.isArray(result)
      ? (result as JsonRecord)
      : { raw: result };

  if (!response.ok || resultRecord.success === false || resultRecord.error) {
    return Response.json(
      {
        success: false,
        error: resultRecord.error || resultRecord.raw || `Google enrichment function failed. Status: ${response.status}`,
        details: { status: response.status, statusText: response.statusText, payload, result: resultRecord },
      },
      { status: response.ok ? 500 : response.status },
    );
  }

  const normalizedResult = resultRecord.result || resultRecord;

  return Response.json({
    success: true,
    ...payload,
    ...resultRecord,
    result: normalizedResult,
  });
}
