import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const roles = ["superadmin", "admin", "manager"] as const;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 1000;
const TYPES = new Set(["restaurant", "activity", "landmark", "stadium", "arena", "park", "beach", "mall", "theater", "museum", "hotel", "transit_hub", "university", "event_venue", "neighborhood", "airport", "attraction"]);
const STRATEGIES = new Set(["dense_urban", "urban", "stadium", "mall", "beach", "large_park", "suburban", "long_island", "transit", "airport"]);

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted && char === '"' && next === '"') { cell += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && char === ",") { row.push(cell); cell = ""; continue; }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers = [], ...body] = rows;
  const normalizedHeaders = headers.map((header) => normalize(header).replace(/ /g, "_"));
  return body.map((values) => Object.fromEntries(normalizedHeaders.map((header, index) => [header, values[index]?.trim() ?? ""]))) as Record<string, string>[];
}

function numberValue(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function enrichCoordinates(row: Record<string, string>) {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return { error: "Google Places API key is not configured" } as const;
  const query = [row.search_query || row.canonical_name, row.city, row.state].filter(Boolean).join(", ");
  const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
  url.searchParams.set("input", query);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set("fields", "place_id,name,formatted_address,geometry");
  url.searchParams.set("key", key);
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json() as { status?: string; candidates?: Array<{ place_id?: string; name?: string; formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }> };
  const candidate = payload.candidates?.[0];
  const latitude = candidate?.geometry?.location?.lat;
  const longitude = candidate?.geometry?.location?.lng;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { error: `No coordinate match (${payload.status || "UNKNOWN"})` } as const;
  return { latitude: Number(latitude), longitude: Number(longitude), placeId: candidate?.place_id ?? null, formattedAddress: candidate?.formatted_address ?? null, matchedName: candidate?.name ?? null } as const;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(roles);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") || "validate");
    const enrichMissing = String(formData.get("enrichMissing") || "false") === "true";
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: "Select a CSV file" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".csv")) return NextResponse.json({ success: false, error: "Only CSV files are supported" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ success: false, error: "CSV exceeds the 2 MB limit" }, { status: 400 });

    const records = parseCsv(await file.text());
    if (!records.length) return NextResponse.json({ success: false, error: "CSV contains no data rows" }, { status: 400 });
    if (records.length > MAX_ROWS) return NextResponse.json({ success: false, error: `CSV exceeds the ${MAX_ROWS}-row limit` }, { status: 400 });

    const names = new Set<string>();
    const errors: Array<{ line: number; message: string }> = [];
    const warnings: Array<{ line: number; message: string }> = [];
    const rows = [] as Array<Record<string, unknown>>;

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const line = index + 2;
      const canonicalName = record.canonical_name?.trim();
      const normalizedName = normalize(canonicalName);
      if (!canonicalName) errors.push({ line, message: "canonical_name is required" });
      if (names.has(normalizedName)) errors.push({ line, message: `duplicate canonical_name: ${canonicalName}` });
      names.add(normalizedName);
      if (!TYPES.has(record.anchor_type)) errors.push({ line, message: `invalid anchor_type: ${record.anchor_type || "blank"}` });
      if (!STRATEGIES.has(record.radius_strategy)) errors.push({ line, message: `invalid radius_strategy: ${record.radius_strategy || "blank"}` });

      let latitude = numberValue(record.latitude || record.lat);
      let longitude = numberValue(record.longitude || record.lng || record.lon || record.long);
      let enrichment: Awaited<ReturnType<typeof enrichCoordinates>> | null = null;
      if ((latitude === null || longitude === null) && enrichMissing) {
        enrichment = await enrichCoordinates(record);
        if ("error" in enrichment) warnings.push({ line, message: enrichment.error });
        else { latitude = enrichment.latitude; longitude = enrichment.longitude; }
      }
      if (latitude === null || latitude < -90 || latitude > 90) errors.push({ line, message: "valid latitude is required" });
      if (longitude === null || longitude < -180 || longitude > 180) errors.push({ line, message: "valid longitude is required" });

      rows.push({
        canonical_name: canonicalName,
        normalized_name: normalizedName,
        aliases: String(record.aliases || "").split(/[|;]/).map(normalize).filter(Boolean),
        anchor_type: record.anchor_type,
        city: record.city || null,
        state: record.state || null,
        borough: record.borough || null,
        neighborhood: record.neighborhood || null,
        county: record.county || null,
        market: record.market || null,
        latitude,
        longitude,
        default_radius_miles: numberValue(record.default_radius_miles) ?? 1,
        max_radius_miles: numberValue(record.max_radius_miles) ?? 3,
        radius_strategy: record.radius_strategy,
        priority: numberValue(record.priority) ?? 50,
        source_type: "curated",
        review_status: record.review_status || "pending_review",
        is_active: true,
        is_searchable: true,
        metadata: {
          source_name: record.source_name || "Admin CSV upload",
          source_url: record.source_url || null,
          search_query: record.search_query || null,
          google_place_id: enrichment && !("error" in enrichment) ? enrichment.placeId : null,
          formatted_address: enrichment && !("error" in enrichment) ? enrichment.formattedAddress : null,
          matched_name: enrichment && !("error" in enrichment) ? enrichment.matchedName : null,
          coordinate_source: enrichment && !("error" in enrichment) ? "google_places" : "csv",
          imported_at: new Date().toISOString(),
        },
      });
    }

    if (errors.length) return NextResponse.json({ success: false, validated: records.length, errors, warnings, preview: rows.slice(0, 10) }, { status: 400 });
    if (mode === "validate") return NextResponse.json({ success: true, validated: rows.length, warnings, preview: rows.slice(0, 10) });

    const { error } = await supabaseAdmin.from("search_anchors").upsert(rows, { onConflict: "normalized_name" });
    if (error) throw error;
    return NextResponse.json({ success: true, imported: rows.length, warnings, enriched: rows.filter((row) => (row.metadata as { coordinate_source?: string }).coordinate_source === "google_places").length });
  } catch (error) {
    console.error("[search-anchors/import] CSV import failed", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to import search anchors" }, { status: 500 });
  }
}
