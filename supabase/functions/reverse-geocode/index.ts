const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getAddressComponent(result: any, type: string, useShort = false) {
  const component = result?.address_components?.find((item: any) => item.types?.includes(type));
  if (!component) return null;
  return useShort ? component.short_name : component.long_name;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ success: false, error: "Authentication required" }, 401);
  }

  const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

  if (!googleKey) {
    return jsonResponse({ success: false, error: "GOOGLE_MAPS_API_KEY is not configured" }, 400);
  }

  try {
    const body = await req.json();
    const lat = body.lat ?? body.latitude;
    const lng = body.lng ?? body.longitude;

    if (lat === undefined || lng === undefined) {
      return jsonResponse({ success: false, error: "lat and lng are required" }, 400);
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("key", googleKey);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok || data.status !== "OK") {
      return jsonResponse(
        {
          success: false,
          error: data.error_message ?? `Google geocoding failed: ${data.status}`,
          providerStatus: data.status,
        },
        400,
      );
    }

    const result = data.results?.[0];

    return jsonResponse({
      success: true,
      formatted_address: result?.formatted_address ?? null,
      city:
        getAddressComponent(result, "locality") ??
        getAddressComponent(result, "sublocality") ??
        getAddressComponent(result, "administrative_area_level_2"),
      state: getAddressComponent(result, "administrative_area_level_1", true),
      zip: getAddressComponent(result, "postal_code"),
      place_name: result?.address_components?.[0]?.long_name ?? null,
      place_id: result?.place_id ?? null,
      provider: "google",
      raw: result,
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
