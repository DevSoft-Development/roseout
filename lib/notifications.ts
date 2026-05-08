import { Resend } from "resend";
import twilio from "twilio";

const resend = new Resend(process.env.RESEND_API_KEY);

export const DEFAULT_ADMIN_NOTIFY_EMAIL = "nick@theouthaven.com";

export function getAdminNotifyEmail() {
  return process.env.ADMIN_NOTIFY_EMAIL?.trim() || DEFAULT_ADMIN_NOTIFY_EMAIL;
}

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

type NotifyInput = {
  toEmail?: string | null;
  toPhone?: string | null;
  subject: string;
  emailHtml?: string;
  smsBody?: string;
  replyTo?: string | null;
  from?: string | null;
};

export async function sendNotification({
  toEmail,
  toPhone,
  subject,
  emailHtml,
  smsBody,
  replyTo,
  from,
}: NotifyInput) {
  const results: {
    email?: unknown;
    sms?: unknown;
    errors: string[];
  } = {
    errors: [],
  };

  if (toEmail && emailHtml && process.env.RESEND_API_KEY) {
    try {
      const email = await resend.emails.send({
        from: from || process.env.EMAIL_FROM || "TheOutHaven <hello@theouthaven.com>",
        to: toEmail,
        subject,
        html: emailHtml,
        replyTo: replyTo || undefined,
      });

      results.email = email;
    } catch (error: unknown) {
      results.errors.push(error instanceof Error ? error.message : "Email failed");
    }
  }

  if (toPhone && smsBody && twilioClient) {
    try {
      const sms = await twilioClient.messages.create({
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: toPhone,
        body: `${smsBody}\n\nReply STOP to opt out. Msg & data rates may apply.`,
      });

      results.sms = sms.sid;
    } catch (error: unknown) {
      results.errors.push(error instanceof Error ? error.message : "SMS failed");
    }
  }

  return results;
}

export async function sendLocationClaimApproved({
  email,
  phone,
  locationName,
  signupUrl,
}: {
  email?: string | null;
  phone?: string | null;
  locationName: string;
  signupUrl?: string | null;
}) {
  return sendNotification({
    toEmail: email,
    toPhone: phone,
    subject: "Your TheOutHaven location claim was approved",
    emailHtml: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <h2>Your TheOutHaven location claim was approved 🎉</h2>
        <p>Your claim for <strong>${locationName}</strong> has been approved.</p>
        <p>You can now create your owner account and manage your listing.</p>
        ${
          signupUrl
            ? `<p><a href="${signupUrl}" style="background:#e1062a;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold;">Create Owner Account</a></p>`
            : ""
        }
      </div>
    `,
    smsBody: signupUrl
      ? `TheOutHaven: Your claim for ${locationName} was approved. Create your owner account: ${signupUrl}`
      : `TheOutHaven: Your claim for ${locationName} was approved.`,
  });
}