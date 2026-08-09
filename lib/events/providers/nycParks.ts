import { normalizeCanonicalEvent } from "../normalization";
import type { NormalizedEvent } from "../types";
import { classifyNycConsumerEventEligibility } from "./consumerEligibility";
import { asRecord, combineDateAndTime, firstBoolean, firstNumber, firstString } from "./shared";

export function normalizeNycParksEvent(input: unknown): NormalizedEvent {
  const row = asRecord(input);
  const startDate = firstString(row, ["start_date", "date", "event_date"]);
  const startTime = firstString(row, ["start_time", "time"]);
  const startsAt = firstString(row, ["starts_at", "start_datetime", "start_date_time"])
    ?? combineDateAndTime(startDate, startTime);
  if (!startsAt) throw new Error("NYC Parks event has no start date");

  const endDate = firstString(row, ["end_date"]);
  const endTime = firstString(row, ["end_time"]);
  const rawId = firstString(row, ["event_id", "id", ":id"]);
  const title = firstString(row, ["name", "event_name", "title"]);
  if (!rawId || !title) throw new Error("NYC Parks event requires an id and title");

  const borough = firstString(row, ["borough", "event_borough"]);
  const venue = firstString(row, ["park_name", "venue_name", "location_name", "location", "event_location"]);
  const free = firstBoolean(row, ["is_free", "free"]);
  const eventType = firstString(row, ["event_type", "category", "categories"]);
  const eligibility = classifyNycConsumerEventEligibility({ title, eventType });
  return normalizeCanonicalEvent({
    provider: "nyc_parks",
    providerEventId: rawId,
    sourceUrl: firstString(row, ["url", "event_url"]),
    externalUrl: firstString(row, ["url", "event_url"]),
    title,
    description: firstString(row, ["description", "summary"]),
    category: eventType,
    venueName: venue,
    address: firstString(row, ["address", "location", "street_address", "event_location"]),
    city: firstString(row, ["city"]) ?? "New York",
    borough,
    state: firstString(row, ["state"]) ?? "NY",
    zipCode: firstString(row, ["zip_code", "zipcode", "zip"]),
    latitude: firstNumber(row, ["latitude", "lat"]),
    longitude: firstNumber(row, ["longitude", "lng", "lon"]),
    startsAt,
    endsAt: firstString(row, ["ends_at", "end_datetime", "end_date_time"])
      ?? combineDateAndTime(endDate, endTime),
    timezone: "America/New_York",
    allDay: !startTime && !firstString(row, ["starts_at", "start_datetime", "start_date_time"]),
    isFree: free ?? true,
    status: "scheduled",
    searchable: eligibility.searchable,
    imageUrl: firstString(row, ["image_url", "image", "photo_url"]),
    providerUpdatedAt: firstString(row, ["updated_at", "last_modified", "last_updated"]),
    providerPayload: row,
  });
}
