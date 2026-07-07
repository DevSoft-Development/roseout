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
  department?: string | null;
};

export async function sendNotification({
  toEmail,
  toPhone,
  subject,
  emailHtml,
  smsBody,
  replyTo,
  from,
  department,
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
        department: department || "account",
        replyTo: replyTo || undefined,
        rendered: {
          subject,
          preview: subject,
          html: emailHtml,
          text: emailHtml
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
          department: (department || "account") as any,
        },
        templateKey: "notification",
      });

      results.email = email;
    } catch (error: unknown) {
      results.errors.push(
        error instanceof Error ? error.message : "Email failed",
      );
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
      results.errors.push(
        error instanceof Error ? error.message : "SMS failed",
      );
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
  return (
    process.env.THEOUTHAVEN_ADMIN_EMAIL ||
    process.env.ADMIN_EMAIL ||
    process.env.NEXT_PUBLIC_ADMIN_EMAIL ||
    "admin@theouthaven.com"
  );
}

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://theouthaven.com"
  ).replace(/\/$/, "");
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

function claimActionUrl(claimRequestId?: string | null) {
  const base = `${siteUrl()}/admin/dashboard/claims`;
  return claimRequestId
    ? `${base}?claimId=${encodeURIComponent(claimRequestId)}`
    : base;
}

function locationAddressText(input: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}) {
  return [input.address, input.city, input.state, input.zipCode]
    .filter(Boolean)
    .join(", ");
}

async function sendClaimEmail(input: {
  toEmail?: string | null;
  subject: string;
  html: string;
  department?: string | null;
}) {
  const result = await sendNotification({
    toEmail: input.toEmail,
    subject: input.subject,
    emailHtml: input.html,
    from: claimEmailFrom(),
    department: input.department || "claims",
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
  claimCode,
  claimRequestId,
  expectedReviewWindow = "1–2 business days",
}: {
  email?: string | null;
  contactNameOrOwnerName?: string | null;
  locationName: string;
  claimCode?: string | null;
  claimRequestId?: string | null;
  expectedReviewWindow?: string | null;
}) {
  const name = contactNameOrOwnerName || "there";
  const claimReference = claimRequestId || claimCode || null;
  return sendClaimEmail({
    toEmail: email,
    subject: "Your TheOutHaven claim is pending review",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        ${paragraphs([
          `Hi ${name},`,
          `We received your claim request for ${locationName}.`,
          claimCode
            ? `Your claim code ${claimCode} was verified and your request is now pending review.`
            : "Your claim is now pending review by TheOutHaven.",
          "Our team reviews claims before giving access to manage a location so the right business owner or authorized team member is connected.",
        ])}
        ${claimReference ? `<p><strong>Claim reference:</strong><br/>${escapeHtml(claimReference)}</p>` : ""}
        <p><strong>What happens next:</strong></p>
        <ol>
          <li>TheOutHaven reviews the claim code, location details, and contact information.</li>
          <li>If anything is unclear, we may email you asking for proof that you own or manage this location.</li>
          <li>Once approved, you will be able to open the business dashboard, update photos/details, manage menus, and use eligible business tools.</li>
        </ol>
        <p><strong>Expected review time:</strong><br/>${escapeHtml(expectedReviewWindow || "1–2 business days")}</p>
        <p>You do not need to submit another claim while this request is pending.</p>
        <p>Thanks,<br/>TheOutHaven</p>
      </div>
    `,
  });
}

export async function sendNoCodeMatchedClaimEmail({
  email,
  contactName,
  locationName,
  claimRequestId,
}: {
  email?: string | null;
  contactName?: string | null;
  locationName: string;
  claimRequestId?: string | null;
}) {
  return sendClaimEmail({
    toEmail: email,
    subject: "Your TheOutHaven location claim is pending review",
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      ${paragraphs([
        `Hi ${contactName || "there"},`,
        `Good news — ${locationName} is already added to TheOutHaven.`,
        "We connected your submission to the existing location and placed your claim in pending review.",
      ])}
      ${claimRequestId ? `<p><strong>Claim reference:</strong><br/>${escapeHtml(claimRequestId)}</p>` : ""}
      <p><strong>What happens next:</strong></p>
      <ol>
        <li>Our team confirms that the submitted contact is authorized to manage this location.</li>
        <li>If more proof is needed, we will email you.</li>
        <li>After approval, you will get access to manage the listing from the business dashboard.</li>
      </ol>
      <p>Thanks,<br/>TheOutHaven</p>
    </div>`,
  });
}

export async function sendNoCodeNewLocationClaimEmail({
  email,
  contactName,
  locationName,
  claimRequestId,
}: {
  email?: string | null;
  contactName?: string | null;
  locationName: string;
  claimRequestId?: string | null;
}) {
  return sendClaimEmail({
    toEmail: email,
    subject: "We received your TheOutHaven location request",
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      ${paragraphs([
        `Hi ${contactName || "there"},`,
        `We received your location claim submission for ${locationName}.`,
        "We could not automatically confirm an existing TheOutHaven listing, so our team will review the location details before adding or connecting it to a business account.",
      ])}
      ${claimRequestId ? `<p><strong>Claim reference:</strong><br/>${escapeHtml(claimRequestId)}</p>` : ""}
      <p><strong>What happens next:</strong></p>
      <ol>
        <li>TheOutHaven reviews the submitted business name, address, phone, website, and contact details.</li>
        <li>If the location already exists, we will connect your request to the existing listing.</li>
        <li>If it needs to be added first, our team will review it before giving dashboard access.</li>
      </ol>
      <p>Thanks,<br/>TheOutHaven</p>
    </div>`,
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
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">${paragraphs(
      [
        `Hi ${contactNameOrOwnerName || "there"},`,
        `Your claim for ${locationName} has been approved.`,
        "You can now access your business dashboard and manage your location on TheOutHaven.",
      ],
    )}<p>Dashboard:<br/><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p>Thanks,<br/>TheOutHaven</p></div>`,
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
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">${paragraphs(
      [
        `Hi ${contactNameOrOwnerName || "there"},`,
        `We reviewed your claim for ${locationName}, but we could not approve it at this time.`,
        "If you believe this was a mistake, please contact TheOutHaven with additional proof of ownership or management authorization.",
        "Thanks,",
        "TheOutHaven",
      ],
    )}</div>`,
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
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">${paragraphs(
      [
        `Hi ${contactNameOrOwnerName || "there"},`,
        `We reviewed your claim for ${locationName}, but we need more information before we can approve it.`,
        "Please reply with documentation or details showing that you are authorized to manage this location.",
        "Thanks,",
        "TheOutHaven",
      ],
    )}</div>`,
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
  claimCode,
  claimRequestId,
  locationId,
  address,
  city,
  state,
  zipCode,
}: {
  locationName: string;
  requestType: string;
  contactNameOrOwnerName?: string | null;
  businessEmail?: string | null;
  phone?: string | null;
  matchStatus?: string | null;
  verificationStatus?: string | null;
  planInterest?: string | null;
  claimCode?: string | null;
  claimRequestId?: string | null;
  locationId?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}) {
  const adminClaimsUrl = claimActionUrl(claimRequestId);
  const addressText = locationAddressText({ address, city, state, zipCode });
  return sendClaimEmail({
    toEmail: claimAdminEmail(),
    department: "admin",
    subject: `Pending claim review: ${locationName}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <h2>Pending claim review</h2>
      <p>A business claim is pending admin review.</p>
      <p><strong>Location:</strong><br/>${escapeHtml(locationName)}</p>
      ${addressText ? `<p><strong>Address:</strong><br/>${escapeHtml(addressText)}</p>` : ""}
      ${locationId ? `<p><strong>Location ID:</strong><br/>${escapeHtml(locationId)}</p>` : ""}
      ${claimCode ? `<p><strong>Claim code:</strong><br/>${escapeHtml(claimCode)}</p>` : ""}
      ${claimRequestId ? `<p><strong>Claim request ID:</strong><br/>${escapeHtml(claimRequestId)}</p>` : ""}
      <p><strong>Claim type:</strong><br/>${escapeHtml(requestType)}</p>
      <p><strong>Submitted by:</strong><br/>${escapeHtml(contactNameOrOwnerName || "Not provided")}<br/>${escapeHtml(businessEmail || "Not provided")}<br/>${escapeHtml(phone || "Not provided")}</p>
      <p><strong>Match status:</strong><br/>${escapeHtml(matchStatus || "pending_review")}</p>
      <p><strong>Verification:</strong><br/>${escapeHtml(verificationStatus || "pending_review")}</p>
      <p><strong>Plan interest:</strong><br/>${escapeHtml(planInterest || "free_discovery")}</p>
      <p><strong>Next steps for admin:</strong></p>
      <ol>
        <li>Open the claim in Admin Claims.</li>
        <li>Confirm the claim code, location match, business email, and role at business.</li>
        <li>Approve only after the owner or authorized manager is verified.</li>
        <li>If proof is missing, mark the claim as needs more info instead of approving.</li>
      </ol>
      <p><strong>Review claim:</strong><br/><a href="${escapeHtml(adminClaimsUrl)}">${escapeHtml(adminClaimsUrl)}</a></p>
    </div>`,
  });
}
