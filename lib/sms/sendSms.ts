import twilio from "twilio";

export async function sendSms(params: { to: string; body: string }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    throw new Error("SMS provider is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.");
  }

  const client = twilio(sid, token);
  const result = await client.messages.create({ to: params.to, from, body: params.body });
  return { id: result.sid, raw: result };
}
