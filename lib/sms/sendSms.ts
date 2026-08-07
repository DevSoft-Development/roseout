import { sendTwilioSms } from "@/lib/sms/twilio";

export async function sendSms(params: { to: string; body: string }) {
  const result = await sendTwilioSms({ to: params.to, body: params.body });
  return { id: result.sid, raw: result };
}
