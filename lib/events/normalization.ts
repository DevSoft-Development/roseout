import type { CanonicalEventInput, EventStatus, NormalizedEvent } from "./types";

function clean(value: string | null | undefined) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function normalizeEventText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIso(value: string, field: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid ${field}`);
  return date.toISOString();
}

function normalizePrice(value: number | null | undefined) {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function normalizeStatus(status: EventStatus | undefined): EventStatus {
  return status ?? "scheduled";
}

export function buildEventDedupeFingerprint(input: Pick<CanonicalEventInput, "title" | "venueName" | "startsAt" | "city">) {
  const start = normalizeIso(input.startsAt, "startsAt").slice(0, 16);
  const title = normalizeEventText(input.title);
  const venue = normalizeEventText(input.venueName);
  const city = normalizeEventText(input.city);
  return [title, venue || "unknown-venue", city || "unknown-city", start].join("|");
}

export function buildEventSearchDocument(input: CanonicalEventInput) {
  return [
    input.title,
    input.description,
    input.category,
    input.subcategory,
    input.venueName,
    input.address,
    input.city,
    input.state,
    input.market,
    input.borough,
    input.county,
  ]
    .map((value) => clean(value))
    .filter(Boolean)
    .join(" ");
}

export function normalizeCanonicalEvent(input: CanonicalEventInput): NormalizedEvent {
  const title = clean(input.title);
  const providerEventId = clean(input.providerEventId);
  if (!title) throw new Error("Event title is required");
  if (!providerEventId) throw new Error("Provider event id is required");

  const startsAt = normalizeIso(input.startsAt, "startsAt");
  const endsAt = input.endsAt ? normalizeIso(input.endsAt, "endsAt") : null;
  if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    throw new Error("Event endsAt cannot be before startsAt");
  }

  const status = normalizeStatus(input.status);
  const sourceKind = input.sourceKind ?? (input.provider === "native" ? "native" : "provider");
  const priceMin = normalizePrice(input.priceMin);
  const priceMax = normalizePrice(input.priceMax);
  const safePriceMax = priceMin != null && priceMax != null && priceMax < priceMin ? priceMin : priceMax;

  const normalized: NormalizedEvent = {
    ...input,
    sourceKind,
    providerEventId,
    title,
    description: clean(input.description),
    category: clean(input.category),
    subcategory: clean(input.subcategory),
    venueName: clean(input.venueName),
    address: clean(input.address),
    city: clean(input.city),
    state: clean(input.state),
    zipCode: clean(input.zipCode),
    market: clean(input.market),
    borough: clean(input.borough),
    county: clean(input.county),
    sourceUrl: clean(input.sourceUrl),
    externalUrl: clean(input.externalUrl),
    imageUrl: clean(input.imageUrl),
    startsAt,
    endsAt,
    timezone: clean(input.timezone) ?? "America/New_York",
    allDay: Boolean(input.allDay),
    priceMin,
    priceMax: safePriceMax,
    currency: clean(input.currency)?.toUpperCase() ?? null,
    isFree: Boolean(input.isFree) || (priceMin === 0 && safePriceMax === 0),
    status,
    searchable: Boolean(input.searchable) && status !== "cancelled" && status !== "completed" && status !== "draft",
    dedupeFingerprint: "",
    searchDocument: "",
  };

  normalized.dedupeFingerprint = buildEventDedupeFingerprint(normalized);
  normalized.searchDocument = buildEventSearchDocument(normalized);
  return normalized;
}
