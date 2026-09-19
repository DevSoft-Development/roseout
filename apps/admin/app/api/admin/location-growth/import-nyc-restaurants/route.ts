import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { importNycRestaurants } from "@/lib/location-growth/nycOpenData";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const IMPORT_TIMEOUT_MS = 290_000;

function getBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;

  const secret = request.headers.get("x-internal-import-secret");
  const bearerToken = getBearerToken(request);
  if (process.env.IMPORT_SECRET && secret === process.env.IMPORT_SECRET) return null;
  if (process.env.CRON_SECRET && bearerToken === process.env.CRON_SECRET) return null;

  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.import);
  return error;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "NYC restaurant import failed";
}

function getSafeProductionMessage(message: string) {
  if (
    message.startsWith("Failed to") ||
    message.startsWith("NYC Open Data") ||
    message.startsWith("Required location growth table") ||
    message.startsWith("NYC restaurant import timed out")
  ) {
    return message;
  }

  return "NYC restaurant import failed. Check server logs for details.";
}

function jsonError(error: unknown, status = 500) {
  const message = getErrorMessage(error);
  console.error("[location-growth/import-nyc-restaurants]", error);
  return NextResponse.json(
    {
      success: false,
      error: process.env.NODE_ENV === "production" ? getSafeProductionMessage(message) : message,
    },
    { status },
  );
}

function timeoutAfter(ms: number) {
  return new Promise<never>((_, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          "NYC restaurant import timed out before completion. Try a smaller limit and check server logs for batch status.",
        ),
      );
    }, ms);

    if (typeof timeout === "object" && "unref" in timeout) timeout.unref();
  });
}

async function runImport(limitInput: unknown, offsetInput: unknown) {
  const limit = Math.min(Math.max(Number(limitInput || 500), 1), 1000);
  const offset = Math.max(Number(offsetInput || 0), 0);
  const result = await Promise.race([
    importNycRestaurants({ limit, offset }),
    timeoutAfter(IMPORT_TIMEOUT_MS),
  ]);
  return NextResponse.json({ success: true, ...result });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth) return auth;
    return runImport(request.nextUrl.searchParams.get("limit"), request.nextUrl.searchParams.get("offset"));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth) return auth;

    const parsedBody = await request.json().catch(() => ({}));
    const body = parsedBody && typeof parsedBody === "object" ? (parsedBody as Record<string, unknown>) : {};
    return runImport(body.limit, body.offset);
  } catch (error) {
    return jsonError(error);
  }
}
