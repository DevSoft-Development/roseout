import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const dynamic = "force-dynamic";

const VALID_SOURCE_TABLES = new Set(["locations", "restaurants", "activities"]);

type RequestBody = {
  sourceTable?: string;
  limit?: number;
  dryRun?: boolean;
  onlyWeakSearchTerms?: boolean;
  onlyMissingPlaceId?: boolean;
  force?: boolean;
  enableFoodProbe?: boolean;
  maxFoodProbesPerRow?: number;
  confirmApply?: boolean;
};

function toPositiveInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager"]);
  if (auth.error) return auth.error;

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const sourceTable = VALID_SOURCE_TABLES.has(String(body.sourceTable))
    ? String(body.sourceTable)
    : "locations";
  const dryRun = body.dryRun !== false;
  const limit = toPositiveInt(body.limit, 10, dryRun ? 100 : 25);

  if (!dryRun && !body.confirmApply) {
    return Response.json(
      {
        success: false,
        error: "Real Google enrichment writes require confirmApply=true.",
      },
      { status: 400 },
    );
  }

  if (!dryRun && limit > 25) {
    return Response.json(
      { success: false, error: "Real Google enrichment writes are capped at 25 rows." },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const secret =
    process.env.GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET || process.env.CRON_SECRET;

  if (!supabaseUrl || !secret) {
    return Response.json(
      {
        success: false,
        error:
          "Missing NEXT_PUBLIC_SUPABASE_URL or GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET/CRON_SECRET.",
      },
      { status: 500 },
    );
  }

  const payload = {
    sourceTable,
    limit,
    dryRun,
    onlyWeakSearchTerms: body.onlyWeakSearchTerms ?? true,
    onlyMissingPlaceId: body.onlyMissingPlaceId ?? false,
    force: body.force ?? false,
    enableFoodProbe: body.enableFoodProbe ?? false,
    maxFoodProbesPerRow: toPositiveInt(body.maxFoodProbesPerRow, 2, 3),
  };

  const response = await fetch(
    `${supabaseUrl}/functions/v1/google-location-enrichment`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": secret,
      },
      body: JSON.stringify(payload),
    },
  );

  const text = await response.text();
  let result: unknown = text;
  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      result = text;
    }
  }

  return Response.json(
    { success: response.ok, payload, result },
    { status: response.ok ? 200 : response.status || 502 },
  );
}
