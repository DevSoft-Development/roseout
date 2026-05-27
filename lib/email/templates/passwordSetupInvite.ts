import { getCreatePasswordUrl } from "@/lib/site-url";
import { formatPasswordSetupExpiry, normalizeInviteRole } from "@/lib/auth/passwordSetupTokens";
import { baseEmailLayout } from "./baseEmailLayout";

export function passwordSetupInviteTemplate(input: {
  first_name: string;
  token: string;
  expires_at: string;
  role: string;
}) {
  const firstName = input.first_name?.trim() || "there";
  const role = normalizeInviteRole(input.role);
  const inviteUrl = getCreatePasswordUrl(input.token);
  const formattedExpiry = formatPasswordSetupExpiry(input.expires_at);

  const config = role === "admin"
    ? {
        subject: "Set up your TheOutHaven admin password",
        heading: "Your admin access is ready",
        intro: "Your TheOutHaven admin account has been created. Create your password to access admin tools, manage users, review locations, and support platform operations.",
        cta: "Set Up Admin Access",
        closing: "Use this access carefully. Admin accounts can manage sensitive platform data.",
      }
    : role === "location_owner"
      ? {
          subject: "Set up your TheOutHaven owner account",
          heading: "Your location owner account is ready",
          intro: "Your TheOutHaven owner account has been created. Create your password to manage your location profile, claims, reservations, promotions, and customer engagement.",
          cta: "Set Up Owner Account",
          closing: "Once your account is active, you’ll be able to manage your business presence on TheOutHaven.",
        }
      : {
          subject: "Create your TheOutHaven password",
          heading: "Welcome to TheOutHaven",
          intro: "Your TheOutHaven account is ready. Create your password to save outings, manage reservations, and get personalized recommendations.",
          cta: "Create My Password",
          closing: "We’re excited to help you discover better outings.",
        };

  const bodyHtml = `<p style="margin:0 0 16px 0;">Hi ${firstName},</p><p style="margin:0 0 16px 0;">${config.intro}</p><p style="margin:0 0 16px 0;">This password setup link expires on ${formattedExpiry}.</p><p style="margin:0 0 16px 0;">Do not share this link.</p><p style="margin:0;">If you were not expecting this email, you can ignore it.</p><p style="margin:16px 0 0 0;">${config.closing}</p>`;

  return {
    subject: config.subject,
    html: baseEmailLayout({ previewText: "Create your secure password for your TheOutHaven account.", heading: config.heading, bodyHtml, ctaLabel: config.cta, ctaUrl: inviteUrl, department: "security" }),
    text: [`Hi ${firstName},`, "", config.intro, "", `This password setup link expires on ${formattedExpiry}.`, "", "Do not share this link.", "", "If you were not expecting this email, you can ignore it.", "", config.closing, "", inviteUrl].join("\n"),
  };
}
