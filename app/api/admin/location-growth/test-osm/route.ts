import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import {
  buildNodeOnlyFilterQuery,
  buildSingleFilterQuery,
  NYC_BBOX,
  NYC_METRO_BBOX,
  OVERPASS_ENDPOINTS,
  OVERPASS_USER_AGENT,
  type OsmFilter,
} from "@/lib/location-growth/osmActivities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;

  const secret = request.headers.get("x-internal-import-secret");
  if (process.env.IMPORT_SECRET && secret === process.env.IMPORT_SECRET) {
    return null;
  }

  const { error } = await requireAdminApiRole(["admin", "superadmin"]);
  return error;
}

function cleanTag(value: unknown, fallback: string) {
  const text = String(value || fallback).trim();
  return /^[a-zA-Z0-9:_-]+$/.test(text) ? text : fallback;
}

function getBbox(value: unknown) {
  return value === "nyc" ? NYC_BBOX : NYC_METRO_BBOX;
}

type DebugOsmElement = {
  id?: number | string;
  type?: string;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
};

function isDebugPayload(
  value: unknown,
): value is { elements: DebugOsmElement[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { elements?: unknown }).elements)
  );
}

function getQuery({
  bboxName,
  filter,
  queryMode,
}: {
  bboxName: "nyc" | "nyc_metro";
  filter: OsmFilter;
  queryMode: "nwr" | "node_only";
}) {
  const bbox = getBbox(bboxName);
  return queryMode === "node_only"
    ? buildNodeOnlyFilterQuery({ bbox, filter })
    : buildSingleFilterQuery({ bbox, filter });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (auth) return auth;

  const body = await request.json().catch(() => ({}));
  const tagKey = cleanTag(body.tagKey, "amenity");
  const tagValue = cleanTag(body.tagValue, "bar");
  const bboxName = body.bbox === "nyc" ? "nyc" : "nyc_metro";
  const queryMode = body.queryMode === "nwr" ? "nwr" : "node_only";
  const filter = { label: `${tagKey}=${tagValue}`, tagKey, tagValue };
  const query = getQuery({ bboxName, filter, queryMode });

  let rawError = "";

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
          "User-Agent": OVERPASS_USER_AGENT,
        },
        body: new URLSearchParams({ data: query }).toString(),
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        rawError = `HTTP ${response.status} ${response.statusText}${
          text ? ` - ${text.slice(0, 1000)}` : ""
        }`;
        continue;
      }

      const payload: unknown = await response.json();
      if (!isDebugPayload(payload)) {
        rawError = "Invalid Overpass JSON: elements array missing";
        continue;
      }

      return NextResponse.json({
        success: true,
        endpoint,
        count: payload.elements.length,
        query,
        queryMode,
        firstElements: payload.elements.slice(0, 5).map((element) => ({
          type: element.type,
          id: element.id,
          name: element.tags?.name ?? null,
          lat: element.lat ?? null,
          lon: element.lon ?? null,
          center: element.center ?? null,
          tags: element.tags ?? {},
        })),
      });
    } catch (error) {
      rawError =
        error instanceof Error && error.name === "AbortError"
          ? "Request timed out"
          : error instanceof Error
            ? error.message
            : String(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  return NextResponse.json(
    {
      success: false,
      endpoint: null,
      query,
      queryMode,
      count: 0,
      firstElements: [],
      rawError: rawError || "All Overpass endpoints failed",
    },
    { status: 500 },
  );
}
