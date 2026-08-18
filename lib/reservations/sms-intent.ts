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

function exactCommandIntent(textInput: string): ReservationSmsIntent | null {
  const text = textInput.trim().toLowerCase();
  if (!text) return UNKNOWN;
  if (/^(cancel|cancel reservation|cancel my reservation)$/.test(text)) return { ...UNKNOWN, intent: "cancel", confidence: 1 };
  if (/^(details|reservation details|my reservation)$/.test(text)) return { ...UNKNOWN, intent: "details", confidence: 1 };
  if (/^(help|options)$/.test(text)) return { ...UNKNOWN, intent: "help", confidence: 1 };
  return null;
}

function fallbackIntent(textInput: string): ReservationSmsIntent {
  const text = textInput.trim().toLowerCase();
  const result: ReservationSmsIntent = { ...UNKNOWN };

  const partyMatch = text.match(/(?:party|guests?|people|persons?)\D{0,16}(\d{1,2})|(?:make it|change (?:it )?to)\s+(\d{1,2})\s*(?:people|guests?|persons?)/i);
  if (partyMatch) {
    const party = Number(partyMatch[1] || partyMatch[2]);
    if (party >= 1 && party <= 100) result.requested_party_size = party;
  }

  const timeMatch = text.match(/(?:time|move|change|reschedule|arrive|arrival|come|coming|be there|show up|showing up|around|at).*?\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i)
    || text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  result.requested_time = normalizeTime(timeMatch?.[1] || null);

  if (result.requested_time) result.intent = "change_time";
  else if (result.requested_party_size) result.intent = "change_party";
  else if (/\b(change|reschedule|move)\b(?:.{0,80})\b(?:my|the|this)?\s*reservation\b/i.test(text)) result.intent = "change_time";
  else return result;

  result.confidence = result.requested_time || result.requested_party_size ? 0.8 : 0.7;
  return result;
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
  const exact = exactCommandIntent(input.text);
  if (exact) return { ...exact, source: "deterministic" as const };

  if (!process.env.OPENAI_API_KEY) {
    return { ...fallbackIntent(input.text), source: "fallback" as const };
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.RESERVATION_SMS_AI_MODEL || "gpt-5-mini",
      store: false,
      input: [
        {
          role: "system",
          content: [
            "You interpret natural-language customer SMS messages about an existing reservation and return structured intent only.",
            "Never invent a date, time, party size, reservation, availability, confirmation, refund, or completed action.",
            "Treat phrases such as 'arrive at 8pm', 'come at 7', 'be there around 6:30', and 'show up at 9' as requests to change reservation time.",
            "If the customer asks for more than one change in the same message, preserve every explicitly requested field even though intent is a single primary label.",
            "Examples: 'move it to 8pm and make it 4 people' => change_time, requested_time 20:00, requested_party_size 4. 'Friday at 7 for 3' => include requested_date, requested_time, and requested_party_size when each is explicit.",
            "Resolve relative dates using the supplied current date. Do not change unstated fields.",
            "If the request is ambiguous or you cannot safely extract a requested value, return unknown or lower confidence rather than guessing.",
          ].join(" "),
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
    return { ...fallbackIntent(input.text), source: "fallback" as const };
  }
}
