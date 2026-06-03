import { handleOptions } from "../_shared/cors.ts";
import { badRequest, ok, serverError, unauthorized } from "../_shared/response.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";

type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type ParsedAddress = {
  city: string | null;
  state: string | null;
  zip: string | null;
};

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function component(components: GoogleAddressComponent[], types: string[], key: "long_name" | "short_name" = "long_name"): string | null {
  const match = components.find((entry) => types.some((type) => entry.types.includes(type)));
  return match?.[key] ?? null;
}

function parseAddressComponents(components: GoogleAddressComponent[] = []): ParsedAddress {
  return {
    city: component(components, ["locality", "postal_town", "sublocality", "administrative_area_level_3"]),
    state: component(components, ["administrative_area_level_1"], "short_name"),
    zip: component(components, ["postal_code"], "long_name"),
  };
}

async function requireAuthenticated(req: Request): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const user = await getUserFromRequest(req, supabase);
  if (!user) throw new Error("UNAUTHORIZED: valid user JWT required");
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return badRequest("POST is required.");

  try {
    await requireAuthenticated(req);

    const body = await req.json().catch(() => ({}));
    const lat = numberOrNull(body.lat ?? body.latitude);
    const lng = numberOrNull(body.lng ?? body.longitude);
    if (lat === null || lng === null) return badRequest("lat and lng are required numeric values.");

    const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!key) {
      return badRequest(
        "GOOGLE_MAPS_API_KEY is not configured. Reverse geocoding is only available for site visit check-ins/location creation when the Google Maps key is set.",
      );
    }

    const endpoint = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    endpoint.searchParams.set("latlng", `${lat},${lng}`);
    endpoint.searchParams.set("key", key);

    const response = await fetch(endpoint);
    const data = await response.json();
    if (!response.ok) return serverError("Google reverse geocoding request failed", data);

    const first = data.results?.[0];
    const parsed = parseAddressComponents(first?.address_components ?? []);

    return ok({
      formatted_address: first?.formatted_address ?? null,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      place_name: component(first?.address_components ?? [], ["establishment", "point_of_interest", "premise"]) ?? first?.name ?? null,
      provider: "google",
      purpose: "site_visit_check_in_or_location_creation_only",
      status: data.status ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.startsWith("UNAUTHORIZED:")) return unauthorized(message.replace("UNAUTHORIZED: ", ""));
    return serverError("reverse-geocode failed", message);
  }
});
