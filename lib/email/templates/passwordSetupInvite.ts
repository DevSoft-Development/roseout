import { buildPasswordSetupUrl, formatPasswordSetupExpiry } from "@/lib/auth/passwordSetupTokens";
import { passwordSetupInviteEmail } from "../templates";

export function passwordSetupInviteTemplate(input: { first_name: string; token: string; expires_at: string; role: string; programName?: string; betaTesterInvite?: boolean; rewardName?: string; dashboardUrl?: string }) {
  const inviteUrl = buildPasswordSetupUrl(input.token);
  const formattedExpiry = formatPasswordSetupExpiry(input.expires_at);
  const isBeta = Boolean(input.betaTesterInvite);
  const programName = input.programName || "TheOutHaven Beta Tester Program";
  const rewardName = input.rewardName || "$100 Beta Tester Reward";
  return passwordSetupInviteEmail({
    firstName: input.first_name,
    role: input.role,
    subject: isBeta ? "Verify your email and create your TheOutHaven beta password" : undefined,
    heading: isBeta ? "Verify your email and create your password" : undefined,
    preview: isBeta ? `Verify your email and create your password for TheOutHaven’s Beta Tester Program.` : undefined,
    intro: isBeta ? `You’re almost ready to join ${programName}. Use the button below to verify your email and create your password.` : undefined,
    ctaUrl: inviteUrl,
    cta: { label: isBeta ? "Verify Email & Create Password" : "Create Password", url: inviteUrl },
    secondaryCta: undefined,
    sections: isBeta ? [
      { type: "paragraph", text: `Hi ${input.first_name?.trim() || "there"},` },
      { type: "paragraph", text: `You’re almost ready to join ${programName}.` },
      { type: "paragraph", text: "Use the button below to verify your email and create your password." },
      { type: "paragraph", text: "After your password is created, we’ll send your approval email with the beta dashboard link." },
      { type: "paragraph", text: `Complete weekly beta tester tasks to stay eligible for the ${rewardName}.` },
      { type: "infoList", title: "Secure setup details", items: [{ label: "Expires", value: formattedExpiry }, { label: "Next step", value: "Approval email after password creation" }] },
      { type: "callout", title: "Security note", text: "Do not share this link. If you were not expecting this email, you can ignore it." },
    ] : [
      { type: "paragraph", text: `Hi ${input.first_name?.trim() || "there"}, create your secure password for TheOutHaven.` },
      { type: "infoList", title: "Secure setup details", items: [{ label: "Expires", value: formattedExpiry }, { label: "Role", value: input.role }] },
      { type: "callout", title: "Security note", text: "Do not share this link. If you were not expecting this email, you can ignore it." },
    ],
  });
}
