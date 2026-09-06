export type MobilePlaceResult = {
  id: string;
  name: string;
  kind: "restaurant" | "activity";
  category: string;
  imageUrl: string | null;
  rating: number | null;
  priceLevel: string | null;
  distanceMiles: number | null;
  publicUrl: string | null;
  reservationUrl: string | null;
  websiteUrl: string | null;
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type MobileOutingResult = {
  id: string;
  restaurant: MobilePlaceResult | null;
  activity: MobilePlaceResult | null;
  distanceMiles: number | null;
  walkMinutes: number | null;
  reason: string | null;
};

export type MobileSearchResponse = {
  ok: true;
  requestId: string | null;
  reply: string | null;
  renderMode: string;
  pairs: MobileOutingResult[];
  restaurants: MobilePlaceResult[];
  activities: MobilePlaceResult[];
};
