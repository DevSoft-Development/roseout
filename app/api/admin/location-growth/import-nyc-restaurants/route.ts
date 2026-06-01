import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { importNycRestaurants } from "@/lib/location-growth/nycOpenData";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const IMPORT_TIMEOUT_MS = 290_000;

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;

  const secret = request.headers.get("x-internal-import-secret");
  if (process.env.IMPORT_SECRET && secret === process.env.IMPORT_SECRET) {
    return null;
  }

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
      error:
        process.env.NODE_ENV === "production"
          ? getSafeProductionMessage(message)
          : message,
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

    if (typeof timeout === "object" && "unref" in timeout) {
      timeout.unref();
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth) return auth;

    const parsedBody = await request.json().catch(() => ({}));
    const body =
      parsedBody && typeof parsedBody === "object"
        ? (parsedBody as Record<string, unknown>)
        : {};

    const limit = Math.min(
      Math.max(Number(body.limit || 500), 1),
      1000,
    );
    const offset = Math.max(Number(body.offset || 0), 0);

    const result = await Promise.race([
      importNycRestaurants({
        limit,
        offset,
      }),
      timeoutAfter(IMPORT_TIMEOUT_MS),
    ]);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return jsonError(error);
  }
}
