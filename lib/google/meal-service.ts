import { getPlaceDetailsNew } from "./places-new-client";

export type GoogleMealPeriod = "breakfast" | "brunch" | "lunch" | "dinner";

export async function fetchGoogleMealPeriods(placeId: string): Promise<GoogleMealPeriod[]> {
  const place = await getPlaceDetailsNew(placeId);
  const periods: GoogleMealPeriod[] = [];
  if (place.servesBreakfast === true) periods.push("breakfast");
  if (place.servesBrunch === true) periods.push("brunch");
  if (place.servesLunch === true) periods.push("lunch");
  if (place.servesDinner === true) periods.push("dinner");
  return periods;
}
