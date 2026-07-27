import { createClient } from "npm:@supabase/supabase-js@2";

const CONTRACT_VERSION = "candidate-search-v1";
const MAX_LIMIT = 100;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-search-internal-secret, x-search-contract-version, x-search-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CandidateDomain = "restaurant" | "activity";

type CandidateRequest = {
  contractVersion: string;
  requestId: string;
  query: string;
  intent: {
    needsRestaurant: boolean;
    needsActivity: boolean;
    geo?: Record<string, unknown>;
  };
  market: {
    selectedMarketId: string | null;
    requestedMarket: string | null;
    resolvedMarket: string | null;
    state: string | null;
    city: string | null;
    borough: string | null;
    neighborhood: string | null;
    county: string | null;
    region: string | null;
    geoStrictness: string;
    radiusMiles: number | null;
  };
  userLocation: {
    latitude: number;
    longitude: number;
  } | null;
  restaurantLimit: number;
  activityLimit: number;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "POST is required." }, 405);
  }

  const expectedSecret = Deno.env.get("SEARCH_EDGE_INTERNAL_SECRET");
  const providedSecret = request.headers.get("x-search-internal-secret");

  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return jsonResponse({ error: "Invalid internal search credentials." }, 401);
  }

  let body: CandidateRequest;

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const validationError = validateRequest(body);
  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "Supabase service credentials are not configured." },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const startedAt = performance.now();

  try {
    const [restaurantLane, activityLane] = await Promise.all([
      body.intent.needsRestaurant
        ? retrieveLane(supabase, body, "restaurant", body.restaurantLimit)
        : Promise.resolve(emptyLane()),
      body.intent.needsActivity
        ? retrieveLane(supabase, body, "activity", body.activityLimit)
        : Promise.resolve(emptyLane()),
    ]);

    return jsonResponse({
      contractVersion: CONTRACT_VERSION,
      requestId: body.requestId,
      restaurants: restaurantLane.rows,
      activities: activityLane.rows,
      timing: {
        totalMs: elapsed(startedAt),
        restaurantQueryMs: restaurantLane.ms,
        activityQueryMs: activityLane.ms,
      },
      metadata: {
        provider: "edge",
        truncated: restaurantLane.truncated || activityLane.truncated,
        restaurantTruncated: restaurantLane.truncated,
        activityTruncated: activityLane.truncated,
        candidateFallbackUsed: false,
      },
    });
  } catch (error) {
    console.error("search-candidates failed", {
      requestId: body.requestId,
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Candidate retrieval failed.",
      },
      500,
    );
  }
});

async function retrieveLane(
  supabase: ReturnType<typeof createClient>,
  request: CandidateRequest,
  domain: CandidateDomain,
  requestedLimit: number,
) {
  const startedAt = performance.now();
  const limit = normalizeLimit(requestedLimit);
  const fetchLimit = Math.min(MAX_LIMIT + 1, limit + 1);

  let query = supabase
    .from("locations")
    .select("*")
    .eq("is_searchable", true)
    .eq("quality_status", "publish_ready")
    .or("duplicate_status.is.null,duplicate_status.neq.duplicate")
    .is("duplicate_of", null)
    .eq("has_photos", true)
    .not("photo_status", "eq", "missing_photo")
    .not("is_hidden", "is", true)
    .is("deleted_at", null)
    .not("status", "in", '("closed","archived","hidden","deleted")')
    .or("is_low_level.is.null,is_low_level.eq.false")
    .not("public_visibility_tier", "in", '("low_level","hidden")')
    .not("curation_tier", "eq", "low_level")
    .or(domainFilter(domain))
    .limit(fetchLimit);

  const market =
    request.market.resolvedMarket ??
    request.market.requestedMarket ??
    request.market.selectedMarketId;

  if (market) query = query.eq("market", market);
  if (request.market.state) query = query.eq("state", request.market.state);
  if (request.market.city) query = query.eq("city", request.market.city);
  if (request.market.borough) query = query.eq("borough", request.market.borough);
  if (request.market.neighborhood) {
    query = query.eq("neighborhood", request.market.neighborhood);
  }
  if (request.market.county) query = query.eq("county", request.market.county);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map(normalizeLocation);

  return {
    rows: rows.slice(0, limit),
    truncated: rows.length > limit,
    ms: elapsed(startedAt),
  };
}

function domainFilter(domain: CandidateDomain): string {
  if (domain === "restaurant") {
    return [
      "restaurant_name.not.is.null",
      "cuisine.not.is.null",
      "cuisine_type.not.is.null",
      "location_type.ilike.%restaurant%",
      "primary_category.ilike.%restaurant%",
      "primary_category.ilike.%dining%",
      "primary_category.ilike.%cafe%",
      "primary_category.ilike.%bakery%",
      "primary_category.ilike.%bistro%",
      "primary_category.ilike.%steakhouse%",
      "primary_category.ilike.%bar and grill%",
      "primary_category.ilike.%gastropub%",
    ].join(",");
  }

  return [
    "activity_name.not.is.null",
    "activity_type.not.is.null",
    "location_type.ilike.%activity%",
    "primary_category.ilike.%activity%",
    "primary_category.ilike.%experience%",
    "primary_category.ilike.%entertainment%",
    "primary_category.ilike.%lounge%",
    "primary_category.ilike.%hookah%",
    "primary_category.ilike.%bowling%",
    "primary_category.ilike.%museum%",
    "primary_category.ilike.%theater%",
    "primary_category.ilike.%theatre%",
    "primary_category.ilike.%cinema%",
    "primary_category.ilike.%arcade%",
    "primary_category.ilike.%karaoke%",
    "primary_category.ilike.%gallery%",
    "primary_category.ilike.%park%",
    "primary_category.ilike.%spa%",
  ].join(",");
}

function normalizeLocation(row: Record<string, unknown>) {
  return {
    ...row,
    id: row.id ?? null,
    latitude: row.latitude == null ? null : finiteNumber(row.latitude),
    longitude: row.longitude == null ? null : finiteNumber(row.longitude),
    distance_miles:
      row.distance_miles == null ? null : finiteNumber(row.distance_miles),
  };
}

function validateRequest(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return "Request body must be an object.";
  }

  const request = value as CandidateRequest;

  if (request.contractVersion !== CONTRACT_VERSION) {
    return `Contract version mismatch. Expected ${CONTRACT_VERSION}.`;
  }

  if (typeof request.requestId !== "string" || !request.requestId.trim()) {
    return "requestId is required.";
  }

  if (typeof request.query !== "string" || !request.query.trim()) {
    return "query is required.";
  }

  if (!request.intent || typeof request.intent !== "object") {
    return "intent is required.";
  }

  if (
    request.intent.needsRestaurant !== true &&
    request.intent.needsActivity !== true
  ) {
    return "At least one candidate domain is required.";
  }

  if (!request.market || typeof request.market !== "object") {
    return "market is required.";
  }

  if (!validLimit(request.restaurantLimit)) {
    return `restaurantLimit must be between 1 and ${MAX_LIMIT}.`;
  }

  if (!validLimit(request.activityLimit)) {
    return `activityLimit must be between 1 and ${MAX_LIMIT}.`;
  }

  return null;
}

function validLimit(value: unknown): boolean {
  return (
    Number.isInteger(Number(value)) &&
    Number(value) >= 1 &&
    Number(value) <= MAX_LIMIT
  );
}

function normalizeLimit(value: number): number {
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(Number(value))));
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyLane() {
  return {
    rows: [],
    truncated: false,
    ms: null,
  };
}

function elapsed(startedAt: number): number {
  return Math.max(0, Number((performance.now() - startedAt).toFixed(2)));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
