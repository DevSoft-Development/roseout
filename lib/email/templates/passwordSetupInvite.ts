import { getCreatePasswordUrl } from "@/lib/site-url";
import { baseEmailLayout } from "./baseEmailLayout";

export function passwordSetupInviteTemplate(input: {
  first_name: string;
  token: string;
  expires_at: string;
  role: string;
}) {
  const firstName = input.first_name?.trim() || "there";
  const role = String(input.role || "").toLowerCase();
  const isOwner = role.includes("owner") || role.includes("location_owner") || role.includes("location owner");
  const intro = isOwner
    ? "Your TheOutHaven owner account has been created so you can manage your location, claims, plans, and customer engagement."
    : "Your TheOutHaven account has been created so you can access saved outings, recommendations, reservations, and account features.";

  const inviteUrl = getCreatePasswordUrl(input.token);
  const bodyHtml = `<p style="margin:0 0 16px 0;">Hi ${firstName},</p><p style="margin:0 0 16px 0;">${intro}</p><p style="margin:0 0 16px 0;">To keep your account secure, please create your own password using the button below.</p><p style="margin:0 0 16px 0;">This password setup link expires on ${input.expires_at}. For your security, do not share this email or link with anyone.</p><p style="margin:0;">If you did not expect this email, you can ignore it or contact customer support.</p>`;

  return {
    subject: "Create your password on TheOutHaven.com",
    html: baseEmailLayout({ previewText: "Create your secure password for your TheOutHaven account.", heading: "Create your password on TheOutHaven.com", bodyHtml, ctaLabel: "Create My Password", ctaUrl: inviteUrl, department: "security" }),
    text: [`Hi ${firstName},`, "", intro, "", "To keep your account secure, please create your own password using the link below.", "", inviteUrl, "", `This password setup link expires on ${input.expires_at}. For your security, do not share this email or link with anyone.`, "", "If you did not expect this email, you can ignore it or contact customer support.", "", "Thank you,", "TheOutHaven.com Security Team"].join("\n"),
  };
}
