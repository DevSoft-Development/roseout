import { normalizeCanonicalEvent } from "../normalization";
import type { NormalizedEvent } from "../types";
import { asRecord, combineDateAndTime, firstBoolean, firstNumber, firstString } from "./shared";

export function normalizeNycParksEvent(input: unknown): NormalizedEvent {
  const row = asRecord(input);
  const startDate = firstString(row, ["start_date", "date", "event_date"]);
  const startTime = firstString(row, ["start_time", "time"]);
  const startsAt = firstString(row, ["starts_at", "start_datetime"]) ?? combineDateAndTime(startDate, startTime);
  if (!startsAt) throw new Error("NYC Parks event has no start date");

  const endDate = firstString(row, ["end_date"]);
  const endTime = firstString(row, ["end_time"]);
  const rawId = firstString(row, ["event_id", "id", ":id"]);
  const title = firstString(row, ["name", "event_name", "title"]);
  if (!rawId || !title) throw new Error("NYC Parks event requires an id and title");

  const free = firstBoolean(row, ["is_free", "free"]);
  return normalizeCanonicalEvent({
    provider: "nyc_parks",
    providerEventId: rawId,
    sourceUrl: firstString(row, ["url", "event_url"]),
    externalUrl: firstString(row, ["url", "event_url"]),
    title,
    description: firstString(row, ["description", "summary"]),
    category: firstString(row, ["category", "categories"]),
    venueName: firstString(row, ["park_name", "venue_name", "location_name", "location"]),
    address: firstString(row, ["address", "location", "street_address"]),
    city: "New York",
    borough: firstString(row, ["borough"]),
    state: "NY",
    zipCode: firstString(row, ["zip_code", "zipcode", "zip"]),
    latitude: firstNumber(row, ["latitude", "lat"]),
    longitude: firstNumber(row, ["longitude", "lng", "lon"]),
    startsAt,
    endsAt: firstString(row, ["ends_at", "end_datetime"]) ?? combineDateAndTime(endDate, endTime),
    timezone: "America/New_York",
    allDay: !startTime && !firstString(row, ["starts_at", "start_datetime"]),
    isFree: free ?? true,
    status: "scheduled",
    searchable: true,
    imageUrl: firstString(row, ["image_url", "image", "photo_url"]),
    providerUpdatedAt: firstString(row, ["updated_at", "last_modified", "last_updated"]),
    providerPayload: row,
  });
}
