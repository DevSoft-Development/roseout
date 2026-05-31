import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import {
  NYC_BBOX,
  NYC_METRO_BBOX,
  OVERPASS_ENDPOINTS,
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
  return value === "nyc_metro" ? NYC_METRO_BBOX : NYC_BBOX;
}

type DebugOsmElement = {
  id?: number | string;
  type?: string;
  tags?: { name?: string };
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

function buildDebugQuery({
  tagKey,
  tagValue,
  bbox,
}: Pick<OsmFilter, "tagKey" | "tagValue"> & {
  bbox: typeof NYC_BBOX;
}) {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  return `[out:json][timeout:25];
(
  node["${tagKey}"="${tagValue}"](${box});
  way["${tagKey}"="${tagValue}"](${box});
  relation["${tagKey}"="${tagValue}"](${box});
);
out center 10;`;
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (auth) return auth;

  const body = await request.json().catch(() => ({}));
  const tagKey = cleanTag(body.tagKey, "amenity");
  const tagValue = cleanTag(body.tagValue, "bar");
  const bboxName = body.bbox === "nyc_metro" ? "nyc_metro" : "nyc";
  const query = buildDebugQuery({
    tagKey,
    tagValue,
    bbox: getBbox(bboxName),
  });

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
        query,
        count: payload.elements.length,
        elements: payload.elements.slice(0, 5).map((element) => ({
          id: element.id,
          type: element.type,
          name: element.tags?.name ?? null,
          lat: element.lat ?? null,
          lon: element.lon ?? null,
          center: element.center ?? null,
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
      query,
      count: 0,
      rawError: rawError || "All Overpass endpoints failed",
    },
    { status: 500 },
  );
}
