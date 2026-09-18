import { NextRequest, NextResponse } from "next/server";

import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SEARCH_HEALTH_ROLES = ["superadmin", "admin", "experience_team"] as const;

function consumerOrigin() {
  return String(
    process.env.THEOUTHAVEN_CONSUMER_ORIGIN ||
      process.env.NEXT_PUBLIC_CONSUMER_SITE_URL ||
      "https://theouthaven.com",
  )
    .trim()
    .replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdminApiRole(SEARCH_HEALTH_ROLES);
  if (error) return error;

  const target = new URL(
    "/api/admin/search-benchmark/run",
    consumerOrigin(),
  );

  if (target.origin === request.nextUrl.origin) {
    return NextResponse.json(
      {
        error:
          "Search Benchmark consumer origin is misconfigured for the isolated Admin surface.",
      },
      { status: 503 },
    );
  }

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  headers.set("x-toh-admin-surface-proxy", "search-benchmark");

  const body = await request.text();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 290_000);

  try {
    const response = await fetch(target, {
      method: "POST",
      cache: "no-store",
      headers,
      body: body || undefined,
      signal: controller.signal,
    });

    const responseBody = await response.arrayBuffer();
    const responseHeaders = new Headers();
    const responseType = response.headers.get("content-type");
    if (responseType) responseHeaders.set("content-type", responseType);

    return new NextResponse(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (caught) {
    return NextResponse.json(
      {
        error:
          caught instanceof Error
            ? caught.message
            : "Unable to reach consumer Search Benchmark runtime.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
