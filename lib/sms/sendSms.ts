import { sendTelnyxSms } from "@/lib/sms/telnyx";

export async function sendSms(params: { to: string; body: string }) {
  return sendTelnyxSms(params);
}
