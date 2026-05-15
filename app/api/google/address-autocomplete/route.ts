import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOOGLE_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = String(body.input || "").trim();

    if (!GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: "Missing Google API key." },
        { status: 500 }
      );
    }

    if (input.length < 2) {
      return NextResponse.json({ predictions: [] });
    }

    const googleRes = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_API_KEY,
          "X-Goog-FieldMask":
            "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
        },
        body: JSON.stringify({
          input,
          includedRegionCodes: ["us"],
        }),
      }
    );

    const data = await googleRes.json();

    if (!googleRes.ok) {
      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            "Google address autocomplete request failed.",
          details: data,
        },
        { status: googleRes.status }
      );
    }

    const predictions =
      data?.suggestions
        ?.map((item: any) => {
          const prediction = item.placePrediction;

          return {
            place_id: prediction?.placeId || "",
            description: prediction?.text?.text || "",
          };
        })
        ?.filter((item: any) => item.place_id && item.description) || [];

    return NextResponse.json({ predictions });
  } catch {
    return NextResponse.json(
      { error: "Address autocomplete failed." },
      { status: 500 }
    );
  }
}