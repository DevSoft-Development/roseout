import { sendRenderedEmail } from "@/lib/email/sender";
import twilio from "twilio";


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

  if (toEmail && emailHtml) {
    try {
      const email = await sendRenderedEmail({
        to: toEmail,
        department: "account",
        replyTo: replyTo || undefined,
        rendered: { subject, preview: subject, html: emailHtml, text: emailHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), department: "account" as any },
        templateKey: "notification",
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
function claimEmailFrom() {
  return process.env.EMAIL_FROM || "TheOutHaven <concierge@theouthaven.com>";
}

function claimAdminEmail() {
  return process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || "concierge@theouthaven.com";
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://theouthaven.com").replace(/\/$/, "");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphs(lines: string[]) {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n");
}

async function sendClaimEmail(input: { toEmail?: string | null; subject: string; html: string }) {
  const result = await sendNotification({
    toEmail: input.toEmail,
    subject: input.subject,
    emailHtml: input.html,
    from: claimEmailFrom(),
  });

  if (result.errors.length) {
    console.error("Claim email failed", result.errors);
  }

  return result;
}

export async function sendClaimCodeSubmittedEmail({
  email,
  contactNameOrOwnerName,
  locationName,
}: {
  email?: string | null;
  contactNameOrOwnerName?: string | null;
  locationName: string;
}) {
  const name = contactNameOrOwnerName || "there";
  return sendClaimEmail({
    toEmail: email,
    subject: "Your TheOutHaven claim is pending review",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        ${paragraphs([
          `Hi ${name},`,
          `We received your claim request for ${locationName}.`,
          "Your claim code was verified, and your request is now pending review by TheOutHaven. Our team reviews claims before giving access to manage a location.",
        ])}
        <p><strong>What happens next:</strong></p>
        <ul><li>We verify your business details.</li><li>We confirm the location connection.</li><li>Once approved, you’ll receive access to manage your location.</li></ul>
        <p>Thanks,<br/>TheOutHaven</p>
      </div>
    `,
  });
}

export async function sendNoCodeMatchedClaimEmail({
  email,
  contactName,
  locationName,
}: {
  email?: string | null;
  contactName?: string | null;
  locationName: string;
}) {
  return sendClaimEmail({
    toEmail: email,
    subject: "Your TheOutHaven location is already added",
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">${paragraphs([
      `Hi ${contactName || "there"},`,
      `Good news — ${locationName} is already added to TheOutHaven.`,
      "We connected your submission to the existing location and placed your claim in pending review. Our team will verify your details before giving access to manage the location.",
      "Thanks,",
      "TheOutHaven",
    ])}</div>`,
  });
}

export async function sendNoCodeNewLocationClaimEmail({
  email,
  contactName,
  locationName,
}: {
  email?: string | null;
  contactName?: string | null;
  locationName: string;
}) {
  return sendClaimEmail({
    toEmail: email,
    subject: "We received your TheOutHaven location request",
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">${paragraphs([
      `Hi ${contactName || "there"},`,
      `We received your location claim submission for ${locationName}.`,
      "We could not automatically confirm an existing TheOutHaven listing, so our team will review your location details before adding or connecting it to a business account.",
      "Thanks,",
      "TheOutHaven",
    ])}</div>`,
  });
}

export async function sendClaimApprovedEmail({
  email,
  contactNameOrOwnerName,
  locationName,
  dashboardUrl,
}: {
  email?: string | null;
  contactNameOrOwnerName?: string | null;
  locationName: string;
  dashboardUrl?: string | null;
}) {
  const url = dashboardUrl || `${siteUrl()}/locations/dashboard`;
  return sendClaimEmail({
    toEmail: email,
    subject: "Your TheOutHaven claim was approved",
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">${paragraphs([
      `Hi ${contactNameOrOwnerName || "there"},`,
      `Your claim for ${locationName} has been approved.`,
      "You can now access your business dashboard and manage your location on TheOutHaven.",
    ])}<p>Dashboard:<br/><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p>Thanks,<br/>TheOutHaven</p></div>`,
  });
}

export async function sendClaimRejectedEmail({
  email,
  contactNameOrOwnerName,
  locationName,
}: {
  email?: string | null;
  contactNameOrOwnerName?: string | null;
  locationName: string;
}) {
  return sendClaimEmail({
    toEmail: email,
    subject: "Update on your TheOutHaven claim",
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">${paragraphs([
      `Hi ${contactNameOrOwnerName || "there"},`,
      `We reviewed your claim for ${locationName}, but we could not approve it at this time.`,
      "If you believe this was a mistake, please contact TheOutHaven with additional proof of ownership or management authorization.",
      "Thanks,",
      "TheOutHaven",
    ])}</div>`,
  });
}

export async function sendClaimNeedsMoreInfoEmail({
  email,
  contactNameOrOwnerName,
  locationName,
}: {
  email?: string | null;
  contactNameOrOwnerName?: string | null;
  locationName: string;
}) {
  return sendClaimEmail({
    toEmail: email,
    subject: "More information needed for your TheOutHaven claim",
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">${paragraphs([
      `Hi ${contactNameOrOwnerName || "there"},`,
      `We reviewed your claim for ${locationName}, but we need more information before we can approve it.`,
      "Please reply with documentation or details showing that you are authorized to manage this location.",
      "Thanks,",
      "TheOutHaven",
    ])}</div>`,
  });
}

export async function sendAdminNewClaimEmail({
  locationName,
  requestType,
  contactNameOrOwnerName,
  businessEmail,
  phone,
  matchStatus,
  verificationStatus,
  planInterest,
}: {
  locationName: string;
  requestType: string;
  contactNameOrOwnerName?: string | null;
  businessEmail?: string | null;
  phone?: string | null;
  matchStatus?: string | null;
  verificationStatus?: string | null;
  planInterest?: string | null;
}) {
  const adminClaimsUrl = `${siteUrl()}/admin/claims`;
  return sendClaimEmail({
    toEmail: claimAdminEmail(),
    subject: `New TheOutHaven claim pending review: ${locationName}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <p>A new location claim is pending review.</p>
      <p><strong>Location:</strong><br/>${escapeHtml(locationName)}</p>
      <p><strong>Claim type:</strong><br/>${escapeHtml(requestType)}</p>
      <p><strong>Submitted by:</strong><br/>${escapeHtml(contactNameOrOwnerName || "Not provided")}<br/>${escapeHtml(businessEmail || "Not provided")}<br/>${escapeHtml(phone || "Not provided")}</p>
      <p><strong>Match status:</strong><br/>${escapeHtml(matchStatus || "pending_review")}</p>
      <p><strong>Verification:</strong><br/>${escapeHtml(verificationStatus || "pending_review")}</p>
      <p><strong>Plan interest:</strong><br/>${escapeHtml(planInterest || "free_discovery")}</p>
      <p><strong>Admin review:</strong><br/><a href="${escapeHtml(adminClaimsUrl)}">${escapeHtml(adminClaimsUrl)}</a></p>
    </div>`,
  });
}
