import { buildPasswordSetupUrl, formatPasswordSetupExpiry } from "@/lib/auth/passwordSetupTokens";
import { passwordSetupInviteEmail } from "../templates";

export function passwordSetupInviteTemplate(input: { first_name: string; token: string; expires_at: string; role: string }) {
  const inviteUrl = buildPasswordSetupUrl(input.token);
  const formattedExpiry = formatPasswordSetupExpiry(input.expires_at);
  return passwordSetupInviteEmail({
    firstName: input.first_name,
    role: input.role,
    ctaUrl: inviteUrl,
    sections: [
      { type: "paragraph", text: `Hi ${input.first_name?.trim() || "there"}, create your secure password for TheOutHaven.` },
      { type: "infoList", title: "Secure setup details", items: [{ label: "Expires", value: formattedExpiry }, { label: "Role", value: input.role }] },
      { type: "callout", title: "Security note", text: "Do not share this link. If you were not expecting this email, you can ignore it." },
    ],
  });
}
