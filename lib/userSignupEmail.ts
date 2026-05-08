import { getSupportSiteUrl, renderSupportEmail, supportEmailFrom } from "@/lib/support";
import { sendNotification } from "@/lib/notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

export async function sendNewUserPasswordSetupEmail({
  email,
  fullName,
}: {
  email: string;
  fullName?: string | null;
}) {
  const normalizedEmail = normalizeEmail(email);
  const name = clean(fullName);

  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email: normalizedEmail,
    options: {
      redirectTo: `${getSupportSiteUrl()}/reset-password`,
    },
  });

  if (error) throw error;

  const passwordUrl = data.properties.action_link;

  return sendNotification({
    toEmail: normalizedEmail,
    subject: "Create your RoseOut password",
    from: supportEmailFrom(),
    emailHtml: renderSupportEmail({
      title: "Create your password",
      greeting: `Hi ${name || "there"},`,
      bodyHtml: `
        <p style="margin:0 0 44px;">Welcome to RoseOut. Use the secure link below to create a new password for your account.</p>
        <p style="margin:0;">If you did not sign up for RoseOut, you can ignore this email.</p>
      `,
      ctaUrl: passwordUrl,
      ctaLabel: "Create password",
      footerText: "This password setup link is generated securely by RoseOut.",
    }),
  });
}
