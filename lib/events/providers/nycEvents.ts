import { normalizeCanonicalEvent } from "../normalization";
import type { NormalizedEvent } from "../types";
import { classifyNycConsumerEventEligibility } from "./consumerEligibility";
import { asRecord, combineDateAndTime, firstBoolean, firstNumber, firstString } from "./shared";

export function normalizeNycEvent(input: unknown): NormalizedEvent {
  const row = asRecord(input);
  const startDate = firstString(row, ["start_date", "startdate", "date", "event_date"]);
  const startTime = firstString(row, ["start_time", "starttime", "time"]);
  const startsAt = firstString(row, ["starts_at", "start_datetime", "start_date_time", "datetime"])
    ?? combineDateAndTime(startDate, startTime);
  if (!startsAt) throw new Error("NYC event has no start date");

  const endDate = firstString(row, ["end_date", "enddate"]);
  const endTime = firstString(row, ["end_time", "endtime"]);
  const endsAt = firstString(row, ["ends_at", "end_datetime", "end_date_time"])
    ?? combineDateAndTime(endDate, endTime);
  const rawId = firstString(row, ["event_id", "eventid", "id", ":id"]);
  const title = firstString(row, ["event_name", "title", "name"]);
  if (!rawId || !title) throw new Error("NYC event requires an id and title");

  const borough = firstString(row, ["borough", "event_borough"]);
  const venue = firstString(row, ["venue_name", "venue", "location_name", "park_name", "event_location"]);
  const free = firstBoolean(row, ["is_free", "free", "free_event"]);
  const eventType = firstString(row, ["event_type", "category", "event_category", "type"]);
  const eligibility = classifyNycConsumerEventEligibility({ title, eventType });
  return normalizeCanonicalEvent({
    provider: "nyc_events",
    providerEventId: rawId,
    sourceUrl: firstString(row, ["url", "event_url", "website"]),
    externalUrl: firstString(row, ["url", "event_url", "website"]),
    title,
    description: firstString(row, ["description", "event_description", "summary"]),
    category: eventType,
    subcategory: firstString(row, ["subcategory", "event_subcategory"]),
    venueName: venue,
    address: firstString(row, ["address", "location", "street_address", "event_location"]),
    city: firstString(row, ["city"]) ?? (borough ? "New York" : null),
    borough,
    state: firstString(row, ["state"]) ?? "NY",
    zipCode: firstString(row, ["zip_code", "zipcode", "zip"]),
    latitude: firstNumber(row, ["latitude", "lat"]),
    longitude: firstNumber(row, ["longitude", "lng", "lon"]),
    startsAt,
    endsAt,
    timezone: "America/New_York",
    allDay: !startTime && !firstString(row, ["starts_at", "start_datetime", "start_date_time", "datetime"]),
    isFree: Boolean(free),
    status: "scheduled",
    searchable: eligibility.searchable,
    imageUrl: firstString(row, ["image_url", "image", "photo_url"]),
    providerUpdatedAt: firstString(row, ["updated_at", "last_modified", "last_updated"]),
    providerPayload: row,
  });
}
