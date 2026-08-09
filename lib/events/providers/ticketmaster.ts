import { normalizeCanonicalEvent } from "../normalization";
import type { NormalizedEvent } from "../types";
import { asRecord, firstImageUrl, firstNumber, firstString } from "./shared";

export function normalizeTicketmasterEvent(input: unknown): NormalizedEvent {
  const event = asRecord(input);
  const embedded = asRecord(event._embedded);
  const venue = asRecord(Array.isArray(embedded.venues) ? embedded.venues[0] : null);
  const dates = asRecord(event.dates);
  const start = asRecord(dates.start);
  const status = asRecord(dates.status);
  const address = asRecord(venue.address);
  const city = asRecord(venue.city);
  const state = asRecord(venue.state);
  const location = asRecord(venue.location);
  const classification = asRecord(Array.isArray(event.classifications) ? event.classifications[0] : null);
  const segment = asRecord(classification.segment);
  const genre = asRecord(classification.genre);
  const priceRange = asRecord(Array.isArray(event.priceRanges) ? event.priceRanges[0] : null);

  const dateTime = firstString(start, ["dateTime"]);
  const localDate = firstString(start, ["localDate"]);
  if (!dateTime && !localDate) throw new Error("Ticketmaster event has no start date");

  const statusCode = firstString(status, ["code"])?.toLowerCase();
  const normalizedStatus = statusCode === "cancelled" ? "cancelled" : statusCode === "postponed" ? "postponed" : "scheduled";
  const priceMin = firstNumber(priceRange, ["min"]);
  const priceMax = firstNumber(priceRange, ["max"]);

  return normalizeCanonicalEvent({
    provider: "ticketmaster",
    providerEventId: firstString(event, ["id"]) ?? "",
    providerUpdatedAt: firstString(event, ["lastUpdated", "updated_at"]),
    sourceUrl: firstString(event, ["url"]),
    externalUrl: firstString(event, ["url"]),
    title: firstString(event, ["name"]) ?? "",
    description: firstString(event, ["info", "pleaseNote", "description"]),
    category: firstString(segment, ["name"]),
    subcategory: firstString(genre, ["name"]),
    venueName: firstString(venue, ["name"]),
    address: firstString(address, ["line1", "line2"]),
    city: firstString(city, ["name"]),
    state: firstString(state, ["stateCode", "name"]),
    zipCode: firstString(venue, ["postalCode"]),
    latitude: firstNumber(location, ["latitude"]),
    longitude: firstNumber(location, ["longitude"]),
    startsAt: dateTime ?? `${localDate}T00:00:00-04:00`,
    timezone: firstString(venue, ["timezone"]) ?? "America/New_York",
    allDay: !dateTime,
    priceMin,
    priceMax,
    currency: firstString(priceRange, ["currency"]),
    isFree: priceMin === 0 && (priceMax == null || priceMax === 0),
    imageUrl: firstImageUrl(event.images),
    status: normalizedStatus,
    searchable: normalizedStatus !== "cancelled",
    providerPayload: event,
  });
}
