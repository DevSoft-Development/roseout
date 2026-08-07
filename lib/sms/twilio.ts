import twilio from "twilio";

const DEFAULT_SITE_URL = "https://theouthaven.com";

export function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.",
    );
  }

  return { accountSid, authToken, fromNumber };
}

export function getTwilioStatusCallbackUrl() {
  const explicit = process.env.TWILIO_STATUS_CALLBACK_URL?.trim();
  if (explicit) return explicit;

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    DEFAULT_SITE_URL
  ).replace(/\/$/, "");

  return `${siteUrl}/api/twilio/status`;
}

export async function sendTwilioSms(input: {
  to: string;
  body: string;
  statusCallback?: string | null;
}) {
  const { accountSid, authToken, fromNumber } = getTwilioConfig();
  const client = twilio(accountSid, authToken);

  return client.messages.create({
    from: fromNumber,
    to: input.to,
    body: input.body,
    statusCallback: input.statusCallback || getTwilioStatusCallbackUrl(),
  });
}

export function validateTwilioWebhook(input: {
  signature: string | null;
  url: string;
  params: Record<string, string>;
}) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken || !input.signature) return false;
  return twilio.validateRequest(authToken, input.signature, input.url, input.params);
}
