import { NextRequest, NextResponse } from "next/server";
import { autocompleteGooglePlacesViaIntegrationApi } from "@/lib/aws/integration-api";

type PlaceSuggestion = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
  };
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePredictions(suggestions: PlaceSuggestion[]) {
  return suggestions
    .map((item) => {
      const prediction = item.placePrediction;
      return {
        place_id: prediction?.placeId || "",
        description: prediction?.text?.text || "",
      };
    })
    .filter((item) => item.place_id && item.description);
}

function jsonWithProvider(payload: unknown, init?: ResponseInit) {
  const response = NextResponse.json(payload, init);
  response.headers.set("X-TheOutHaven-Google-Provider", "aws-integration");
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = String(body.input || "").trim();
    const sessionToken = String(body.sessionToken || "").trim();
    if (input.length < 2) return NextResponse.json({ predictions: [] });
    const suggestions = await autocompleteGooglePlacesViaIntegrationApi<PlaceSuggestion>(input, sessionToken || undefined);
    return jsonWithProvider({ predictions: normalizePredictions(suggestions) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && error.message ? error.message : "Address autocomplete failed." },
      { status: 502 },
    );
  }
}
