import "server-only";
import OpenAI from "openai";

export type ReservationSmsIntent = {
  intent: "cancel" | "change_time" | "change_date" | "change_party" | "details" | "help" | "unknown";
  requested_date: string | null;
  requested_time: string | null;
  requested_party_size: number | null;
  confidence: number;
};

const UNKNOWN: ReservationSmsIntent = {
  intent: "unknown",
  requested_date: null,
  requested_time: null,
  requested_party_size: null,
  confidence: 0,
};

function normalizeTime(value: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  const suffix = match[3]?.toLowerCase();
  if (minute > 59 || hour > 23) return null;
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === "pm" && hour !== 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function deterministicIntent(textInput: string): ReservationSmsIntent | null {
  const text = textInput.trim().toLowerCase();
  if (!text) return UNKNOWN;
  if (/^(cancel|cancel reservation|cancel my reservation)$/.test(text)) return { ...UNKNOWN, intent: "cancel", confidence: 1 };
  if (/^(details|reservation details|my reservation)$/.test(text)) return { ...UNKNOWN, intent: "details", confidence: 1 };
  if (/^(help|options)$/.test(text)) return { ...UNKNOWN, intent: "help", confidence: 1 };

  const partyMatch = text.match(/(?:party|guests?|people|persons?)\D{0,12}(\d{1,2})|(?:make it|change (?:it )?to)\s+(\d{1,2})\s*(?:people|guests?|persons?)/i);
  if (partyMatch) {
    const party = Number(partyMatch[1] || partyMatch[2]);
    if (party >= 1 && party <= 100) return { ...UNKNOWN, intent: "change_party", requested_party_size: party, confidence: 0.99 };
  }

  const timeMatch = text.match(/(?:time|move|change|reschedule).*?\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
  const normalized = normalizeTime(timeMatch?.[1] || null);
  if (normalized) return { ...UNKNOWN, intent: "change_time", requested_time: normalized, confidence: 0.95 };

  return null;
}

function cleanResult(value: any): ReservationSmsIntent {
  const allowed = new Set(["cancel", "change_time", "change_date", "change_party", "details", "help", "unknown"]);
  return {
    intent: allowed.has(value?.intent) ? value.intent : "unknown",
    requested_date: typeof value?.requested_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.requested_date) ? value.requested_date : null,
    requested_time: normalizeTime(typeof value?.requested_time === "string" ? value.requested_time : null),
    requested_party_size: Number.isInteger(value?.requested_party_size) && value.requested_party_size > 0 && value.requested_party_size <= 100 ? value.requested_party_size : null,
    confidence: Math.max(0, Math.min(1, Number(value?.confidence || 0))),
  };
}

export async function parseReservationSmsIntent(input: {
  text: string;
  currentDate: string;
  reservationDate?: string | null;
  reservationTime?: string | null;
  partySize?: number | null;
}) {
  const deterministic = deterministicIntent(input.text);
  if (deterministic) return { ...deterministic, source: "deterministic" as const };
  if (!process.env.OPENAI_API_KEY) return { ...UNKNOWN, source: "fallback" as const };

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.RESERVATION_SMS_AI_MODEL || "gpt-5-mini",
      store: false,
      input: [
        {
          role: "system",
          content: "You classify customer SMS messages about an existing reservation. Never invent a date, time, party size, reservation, availability, confirmation, refund, or action. Resolve relative dates using the supplied current date. Return only the requested structured fields. If uncertain, use unknown and low confidence.",
        },
        {
          role: "user",
          content: `Current date: ${input.currentDate}\nExisting reservation date: ${input.reservationDate || "unknown"}\nExisting reservation time: ${input.reservationTime || "unknown"}\nExisting party size: ${input.partySize || "unknown"}\nCustomer SMS: ${input.text}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "reservation_sms_intent",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              intent: { type: "string", enum: ["cancel", "change_time", "change_date", "change_party", "details", "help", "unknown"] },
              requested_date: { type: ["string", "null"] },
              requested_time: { type: ["string", "null"] },
              requested_party_size: { type: ["integer", "null"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["intent", "requested_date", "requested_time", "requested_party_size", "confidence"],
          },
        },
      },
    });

    return { ...cleanResult(JSON.parse(response.output_text || "{}")), source: "ai" as const };
  } catch (error) {
    console.error("Reservation SMS intent parsing failed", error);
    return { ...UNKNOWN, source: "fallback" as const };
  }
}
