import { getLocationName } from "@/lib/locationName";

export type GoogleDirectionsTravelMode = "walking" | "driving";

type DirectionLocation = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  name?: string | null;
};

function locationAddress(location: DirectionLocation) {
  return [
    location.address,
    location.city,
    location.state,
    location.zip_code,
  ]
    .filter(Boolean)
    .join(", ");
}

function locationCoordinates(location: DirectionLocation) {
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  if (!latitude || !longitude) return "";

  return `${latitude},${longitude}`;
}

function googleLocationQuery(location: DirectionLocation) {
  const name = getLocationName(location, "");
  return locationAddress(location) || locationCoordinates(location) || name;
}

export function buildGoogleDirectionsUrl({
  origin,
  destination,
  travelMode,
}: {
  origin: DirectionLocation | null;
  destination: DirectionLocation | null;
  travelMode: GoogleDirectionsTravelMode;
}) {
  if (!origin || !destination) return "";

  const originQuery = googleLocationQuery(origin);
  const destinationQuery = googleLocationQuery(destination);

  if (!originQuery || !destinationQuery) return "";

  const params = new URLSearchParams({
    api: "1",
    origin: originQuery,
    destination: destinationQuery,
    travelmode: travelMode,
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildGooglePlaceDirectionsUrl({
  destination,
  travelMode = "driving",
}: {
  destination: DirectionLocation | null;
  travelMode?: GoogleDirectionsTravelMode;
}) {
  if (!destination) return "";

  const destinationQuery = googleLocationQuery(destination);

  if (!destinationQuery) return "";

  const params = new URLSearchParams({
    api: "1",
    destination: destinationQuery,
    travelmode: travelMode,
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
