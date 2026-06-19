import { createClient } from "@supabase/supabase-js";
import { importNycDohmhHealthData } from "@/lib/health/nycDohmh";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const dynamic = "force-dynamic";

type Options = {
  limit?: number;
  batchSize?: number;
  maxPages?: number;
  dryRun?: boolean;
  sinceDate?: string | null;
};

function isSecretAuthorized(request: Request) {
  if (process.env.NODE_ENV === "development") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  return (
    auth === `Bearer ${secret}` ||
    request.headers.get("x-cron-secret") === secret
  );
}

async function isAuthorized(request: Request) {
  if (isSecretAuthorized(request)) return true;
  try {
    const result = await requireAdminApiRole([
      "superadmin",
      "admin",
      "manager",
    ]);
    return !result.error;
  } catch {
    return false;
  }
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseBool(value: unknown) {
  return value === true || value === "true" || value === "1";
}
function parseIntOpt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}
async function parseOptions(request: Request): Promise<Options> {
  const url = new URL(request.url);
  let body: any = {};
  if (request.method === "POST") body = await request.json().catch(() => ({}));
  return {
    limit: parseIntOpt(body.limit ?? url.searchParams.get("limit")) ?? 5000,
    batchSize:
      parseIntOpt(body.batchSize ?? url.searchParams.get("batchSize")) ?? 1000,
    maxPages:
      parseIntOpt(body.maxPages ?? url.searchParams.get("maxPages")) ?? 5,
    dryRun: parseBool(body.dryRun ?? url.searchParams.get("dryRun")) || false,
    sinceDate:
      (body.sinceDate ?? url.searchParams.get("sinceDate") ?? null) || null,
  };
}

async function handler(request: Request) {
  if (!(await isAuthorized(request)))
    return Response.json(
      {
        success: false,
        error: "Unauthorized health intelligence import request.",
      },
      { status: 401 },
    );
  try {
    const summary = await importNycDohmhHealthData({
      supabase: supabaseAdmin(),
      ...(await parseOptions(request)),
    });
    return Response.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("Missing NEXT_PUBLIC_SUPABASE_URL")
      ? 500
      : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}

export async function GET(request: Request) {
  return handler(request);
}
export async function POST(request: Request) {
  return handler(request);
}
