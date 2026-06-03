import { handleOptions } from "../_shared/cors.ts";
import { badRequest, ok, serverError } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return badRequest("POST is required.");

  try {
    const body = await req.json().catch(() => ({}));
    const address = String(body.address ?? "").trim();
    if (!address) return badRequest("address is required.");

    const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!key) {
      return ok({
        provider: "manual_fallback",
        formattedAddress: address,
        lat: null,
        lng: null,
        placeId: null,
        placeName: null,
      });
    }

    const endpoint = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    endpoint.searchParams.set("address", address);
    endpoint.searchParams.set("key", key);

    const response = await fetch(endpoint);
    const data = await response.json();
    const first = data.results?.[0];

    return ok({
      provider: "google",
      formattedAddress: first?.formatted_address ?? null,
      lat: first?.geometry?.location?.lat ?? null,
      lng: first?.geometry?.location?.lng ?? null,
      placeId: first?.place_id ?? null,
      placeName: first?.address_components?.[0]?.long_name ?? null,
      status: data.status ?? null,
    });
  } catch (error) {
    return serverError("geocode-address failed", error instanceof Error ? error.message : "Unknown error");
  }
});
