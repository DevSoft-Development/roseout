import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOOGLE_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const { placeId } = await req.json();

    if (!GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: "Missing Google API key." },
        { status: 500 }
      );
    }

    if (!placeId) {
      return NextResponse.json(
        { error: "Missing placeId." },
        { status: 400 }
      );
    }

    const googleRes = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": "formattedAddress,addressComponents",
      },
    });

    const data = await googleRes.json();

    if (!googleRes.ok) {
      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            "Google address details request failed.",
          details: data,
        },
        { status: googleRes.status }
      );
    }

    const components = data.addressComponents || [];

    const getComponent = (type: string, short = false) => {
      const component = components.find((item: any) =>
        item.types?.includes(type)
      );

      if (!component) return "";

      return short
        ? component.shortText || ""
        : component.longText || "";
    };

    const streetNumber = getComponent("street_number");
    const route = getComponent("route");

    return NextResponse.json({
      address:
        streetNumber && route
          ? `${streetNumber} ${route}`
          : data.formattedAddress || "",
      city:
        getComponent("locality") ||
        getComponent("postal_town") ||
        getComponent("sublocality") ||
        getComponent("administrative_area_level_2"),
      state: getComponent("administrative_area_level_1", true),
      zip_code: getComponent("postal_code"),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Address details failed." },
      { status: 500 }
    );
  }
}