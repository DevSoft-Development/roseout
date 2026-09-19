import { detectRequestedGeo } from "@/lib/search/geo-matching";
import { mobileError, mobileJson } from "../../_lib/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function titleCaseLocation(value: string) {
  return value
    .replaceAll("_", " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function detectedArea(query: string) {
  const geo = detectRequestedGeo(query);
  if (!geo) return null;

  const value =
    geo.neighborhood ||
    geo.area ||
    geo.borough ||
    geo.city ||
    geo.county ||
    geo.areaGroup ||
    geo.region ||
    geo.terms?.[0] ||
    "";

  if (!value) return null;

  return {
    area: titleCaseLocation(value),
    geoType: geo.geoType,
    requestedMarket: geo.requestedMarket || null,
  };
}

export async function POST(request: Request) {
  let body: { query?: unknown };
  try {
    body = (await request.json()) as { query?: unknown };
  } catch {
    return mobileError("INVALID_JSON", "Planner request was not valid JSON.", 400);
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return mobileError("QUERY_REQUIRED", "Tell TheOutHaven what you want to do.", 400);
  }

  return mobileJson({
    ok: true,
    detectedLocation: detectedArea(query),
  });
}
