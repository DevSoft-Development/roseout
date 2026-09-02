import { NextRequest, NextResponse } from "next/server";
import {
  autocompleteGooglePlacesViaIntegrationApi,
  platformIntegrationApiConfigured,
} from "@/lib/aws/integration-api";

type PlaceSuggestion = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
  };
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function directGoogleApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || "";
}

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

function jsonWithProvider(
  payload: unknown,
  provider: "aws-integration" | "direct-fallback",
  init?: ResponseInit,
) {
  const response = NextResponse.json(payload, init);
  response.headers.set("X-TheOutHaven-Google-Provider", provider);
  return response;
}

async function directAutocomplete(input: string, sessionToken: string) {
  const key = directGoogleApiKey();
  if (!key) throw new Error("Missing Google API key.");

  const googleRes = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
      },
      body: JSON.stringify({
        input,
        includedRegionCodes: ["us"],
        ...(sessionToken ? { sessionToken } : {}),
      }),
      cache: "no-store",
    },
  );

  const data = await googleRes.json().catch(() => null);
  if (!googleRes.ok) {
    throw new Error(
      data?.error?.message ||
        `Google address autocomplete request failed with ${googleRes.status}.`,
    );
  }
  return normalizePredictions(Array.isArray(data?.suggestions) ? data.suggestions : []);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = String(body.input || "").trim();
    const sessionToken = String(body.sessionToken || "").trim();

    if (input.length < 2) {
      return NextResponse.json({ predictions: [] });
    }

    if (platformIntegrationApiConfigured()) {
      try {
        const suggestions = await autocompleteGooglePlacesViaIntegrationApi<PlaceSuggestion>(
          input,
          sessionToken || undefined,
        );
        return jsonWithProvider(
          { predictions: normalizePredictions(suggestions) },
          "aws-integration",
        );
      } catch (error) {
        console.warn("[google-address-autocomplete] AWS Integration failed; using direct fallback", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const predictions = await directAutocomplete(input, sessionToken);
    return jsonWithProvider({ predictions }, "direct-fallback");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Address autocomplete failed.",
      },
      { status: 502 },
    );
  }
}
