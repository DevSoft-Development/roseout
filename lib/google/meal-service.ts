export type GoogleMealPeriod = "breakfast" | "brunch" | "lunch" | "dinner";

type GoogleMealServicePlace = {
  id?: string;
  servesBreakfast?: boolean;
  servesBrunch?: boolean;
  servesLunch?: boolean;
  servesDinner?: boolean;
};

const MEAL_SERVICE_FIELD_MASK =
  "id,servesBreakfast,servesBrunch,servesLunch,servesDinner";

function googleApiKey() {
  const key =
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new Error("Missing GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY");
  return key;
}

export async function fetchGoogleMealPeriods(placeId: string): Promise<GoogleMealPeriod[]> {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": googleApiKey(),
        "X-Goog-FieldMask": MEAL_SERVICE_FIELD_MASK,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google meal-service lookup failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const place = (await response.json()) as GoogleMealServicePlace;
  const periods: GoogleMealPeriod[] = [];
  if (place.servesBreakfast === true) periods.push("breakfast");
  if (place.servesBrunch === true) periods.push("brunch");
  if (place.servesLunch === true) periods.push("lunch");
  if (place.servesDinner === true) periods.push("dinner");
  return periods;
}
