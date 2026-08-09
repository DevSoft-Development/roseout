import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { runEventProviderIngestion } from "@/lib/events/ingestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function getBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
}

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;
  const internalSecret = request.headers.get("x-internal-import-secret");
  const bearer = getBearerToken(request);
  if (process.env.IMPORT_SECRET && internalSecret === process.env.IMPORT_SECRET) return null;
  if (process.env.CRON_SECRET && bearer === process.env.CRON_SECRET) return null;
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.import);
  return error;
}

function parseProviders(input: unknown) {
  if (!Array.isArray(input)) return undefined;
  const allowed = new Set(["ticketmaster", "nyc_events", "nyc_parks"]);
  return input.filter((value): value is "ticketmaster" | "nyc_events" | "nyc_parks" =>
    typeof value === "string" && allowed.has(value),
  );
}

export async function POST(request: NextRequest) {
  const authError = await authorize(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const result = await runEventProviderIngestion({
    providers: parseProviders(body?.providers),
    maxPages: Number(body?.maxPages),
    pageSize: Number(body?.pageSize),
  });

  return NextResponse.json({
    success: result.success,
    action: "event_provider_ingestion",
    ...result,
  }, { status: result.success ? 200 : 207 });
}
