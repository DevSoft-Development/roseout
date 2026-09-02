import { NextRequest, NextResponse } from "next/server";
import { getGooglePlaceDetailsViaIntegrationApi } from "@/lib/aws/integration-api";

type AddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type AddressPlace = {
  id?: string;
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  location?: { latitude?: number; longitude?: number };
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatAddressDetails(data: AddressPlace, placeId: string) {
  const components = data.addressComponents || [];
  const getComponent = (type: string, short = false) => {
    const component = components.find((item) => item.types?.includes(type));
    if (!component) return "";
    return short ? component.shortText || "" : component.longText || "";
  };
  const streetNumber = getComponent("street_number");
  const route = getComponent("route");
  return {
    address: streetNumber && route ? `${streetNumber} ${route}` : data.formattedAddress || "",
    city: getComponent("locality") || getComponent("postal_town") || getComponent("sublocality") || getComponent("administrative_area_level_2"),
    state: getComponent("administrative_area_level_1", true),
    zip_code: getComponent("postal_code"),
    neighborhood: getComponent("neighborhood") || getComponent("sublocality") || getComponent("sublocality_level_1"),
    latitude: data.location?.latitude ?? null,
    longitude: data.location?.longitude ?? null,
    google_place_id: data.id || placeId,
    formatted_address: data.formattedAddress || "",
  };
}

function jsonWithProvider(payload: unknown, init?: ResponseInit) {
  const response = NextResponse.json(payload, init);
  response.headers.set("X-TheOutHaven-Google-Provider", "aws-integration");
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const placeId = String(body.placeId || "").trim();
    const sessionToken = String(body.sessionToken || "").trim();
    if (!placeId) return NextResponse.json({ error: "Missing placeId." }, { status: 400 });
    const place = await getGooglePlaceDetailsViaIntegrationApi<AddressPlace>(placeId, { sessionToken: sessionToken || undefined });
    return jsonWithProvider(formatAddressDetails(place, placeId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && error.message ? error.message : "Address details failed." },
      { status: 502 },
    );
  }
}
