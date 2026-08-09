import type { EventProvider, NormalizedEvent } from "../types";
import { normalizeNycEvent } from "./nycEvents";
import { normalizeNycParksEvent } from "./nycParks";
import { normalizeTicketmasterEvent } from "./ticketmaster";

export function normalizeProviderEvent(provider: Exclude<EventProvider, "native">, payload: unknown): NormalizedEvent {
  switch (provider) {
    case "ticketmaster":
      return normalizeTicketmasterEvent(payload);
    case "nyc_events":
      return normalizeNycEvent(payload);
    case "nyc_parks":
      return normalizeNycParksEvent(payload);
  }
}

export function normalizeProviderEvents(provider: Exclude<EventProvider, "native">, payloads: unknown[]) {
  const events: NormalizedEvent[] = [];
  const rejected: Array<{ index: number; reason: string }> = [];

  payloads.forEach((payload, index) => {
    try {
      events.push(normalizeProviderEvent(provider, payload));
    } catch (error) {
      rejected.push({ index, reason: error instanceof Error ? error.message : "Unknown event normalization failure" });
    }
  });

  return { events, rejected };
}
