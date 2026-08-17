import { sendTransactionalSms } from "@/lib/sms/telnyx";

export async function sendSms(params: { to: string; body: string }) {
  return sendTransactionalSms(params);
}
