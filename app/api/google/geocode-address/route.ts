import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOOGLE_API_KEY =
  process.env.GOOGLE_GEOCODING_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_PLACES_API_KEY;

type AddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

function getComponent(
  components: AddressComponent[],
  type: string,
  short = false
) {
  const component = components.find((item) => item.types?.includes(type));
  if (!component) return "";
  return short ? component.short_name || "" : component.long_name || "";
}

function clean(value: unknown) {
  return String(value || "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const address = clean(body.address);
    const city = clean(body.city);
    const state = clean(body.state);
    const zipCode = clean(body.zip_code);
    const typedAddress = [address, city, state, zipCode].filter(Boolean).join(", ");

    if (!GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: "Missing Google API key." },
        { status: 500 }
      );
    }

    if (!typedAddress) {
      return NextResponse.json(
        { error: "Enter an address before geocoding." },
        { status: 400 }
      );
    }

    const googleRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({
        address: typedAddress,
        region: "us",
        key: GOOGLE_API_KEY,
      })}`
    );

    const data = await googleRes.json();

    if (!googleRes.ok || data.status !== "OK") {
      return NextResponse.json(
        {
          error:
            data.error_message ||
            (data.status === "ZERO_RESULTS"
              ? "No coordinates found for this address."
              : "Google geocoding request failed."),
          details: data.status,
        },
        { status: googleRes.ok ? 404 : googleRes.status }
      );
    }

    const result = data.results?.[0];
    const components: AddressComponent[] = result?.address_components || [];
    const streetNumber = getComponent(components, "street_number");
    const route = getComponent(components, "route");

    return NextResponse.json({
      address:
        streetNumber && route
          ? `${streetNumber} ${route}`
          : address || result?.formatted_address || "",
      city:
        getComponent(components, "locality") ||
        getComponent(components, "postal_town") ||
        getComponent(components, "sublocality") ||
        getComponent(components, "administrative_area_level_2"),
      state: getComponent(components, "administrative_area_level_1", true),
      zip_code: getComponent(components, "postal_code"),
      neighborhood:
        getComponent(components, "neighborhood") ||
        getComponent(components, "sublocality") ||
        getComponent(components, "sublocality_level_1"),
      latitude: result?.geometry?.location?.lat ?? null,
      longitude: result?.geometry?.location?.lng ?? null,
      google_place_id: result?.place_id || "",
      formatted_address: result?.formatted_address || "",
    });
  } catch {
    return NextResponse.json(
      { error: "Address geocoding failed." },
      { status: 500 }
    );
  }
}
