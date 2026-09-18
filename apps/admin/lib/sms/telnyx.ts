import "server-only";

import {
  platformIntegrationApiConfigured,
  sendTelnyxSmsViaIntegrationApi,
} from "@/lib/aws/integration-api";

export type TelnyxSmsPurpose =
  | "transactional"
  | "crm"
  | "reservations"
  | "support"
  | "marketing"
  | "concierge";

export function normalizePhone(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

export const TELNYX_CHANNEL_NUMBERS = {
  concierge: "+15162000411",
  crm: "+15162000701",
  reservations: "+15162000601",
  support: "+15162000801",
  marketing: "+15162000501",
  inactive: "+15162000704",
} as const;

export function purposeForTelnyxNumber(value?: string | null): TelnyxSmsPurpose | null {
  const number = normalizePhone(value);
  if (!number) return null;
  if (number === TELNYX_CHANNEL_NUMBERS.concierge) return "concierge";
  if (number === TELNYX_CHANNEL_NUMBERS.crm) return "crm";
  if (number === TELNYX_CHANNEL_NUMBERS.reservations) return "reservations";
  if (number === TELNYX_CHANNEL_NUMBERS.support) return "support";
  if (number === TELNYX_CHANNEL_NUMBERS.marketing) return "marketing";
  return null;
}

export async function sendTelnyxSmsFromNumber(params: {
  to: string;
  body: string;
  fromNumber?: string | null;
}) {
  const to = normalizePhone(params.to);
  const body = String(params.body || "").trim();
  if (!to) throw new Error("SMS recipient is missing.");
  if (!body) throw new Error("SMS body is missing.");
  if (body.length > 1600) throw new Error("SMS body must be 1600 characters or fewer.");
  if (!platformIntegrationApiConfigured()) {
    throw new Error("AWS Integration API is required for Telnyx SMS.");
  }
  const purpose = purposeForTelnyxNumber(params.fromNumber) || "support";
  return sendTelnyxSmsViaIntegrationApi(purpose, to, body);
}


export function sendCrmSms(params: { to: string; body: string }) {
  const to = normalizePhone(params.to);
  const body = String(params.body || "").trim();
  if (!to) throw new Error("SMS recipient is missing.");
  if (!body) throw new Error("SMS body is missing.");
  if (body.length > 1600) throw new Error("SMS body must be 1600 characters or fewer.");
  if (!platformIntegrationApiConfigured()) {
    throw new Error("AWS Integration API is required for Telnyx SMS.");
  }
  return sendTelnyxSmsViaIntegrationApi("crm", to, body);
}
