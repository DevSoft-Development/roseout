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
    subject: isBeta ? "You're approved for TheOutHaven's Beta Tester Program" : undefined,
    heading: isBeta ? "Beta tester access is ready" : undefined,
    preview: isBeta ? `Create your password to access your beta dashboard and weekly tasks.` : undefined,
    intro: isBeta ? `You're approved for ${programName}. Create your password to access your beta dashboard.` : undefined,
    ctaUrl: inviteUrl,
    cta: { label: "Create Password", url: inviteUrl },
    secondaryCta: isBeta && input.dashboardUrl ? { label: "Open Beta Dashboard", url: input.dashboardUrl } : undefined,
    sections: isBeta ? [
      { type: "paragraph", text: `Hi ${input.first_name?.trim() || "there"}, you're approved for ${programName}.` },
      { type: "paragraph", text: `Create your password to access your beta dashboard and complete weekly beta tester tasks.` },
      { type: "paragraph", text: `Complete your weekly beta tasks to stay eligible for the ${rewardName}. Social follow and tagged friends requirements are admin verified.` },
      { type: "infoList", title: "Secure setup details", items: [{ label: "Expires", value: formattedExpiry }, { label: "Dashboard", value: input.dashboardUrl || "/user/dashboard/beta" }] },
      { type: "callout", title: "Security note", text: "Do not share this link. If you were not expecting this email, you can ignore it." },
    ] : [
      { type: "paragraph", text: `Hi ${input.first_name?.trim() || "there"}, create your secure password for TheOutHaven.` },
      { type: "infoList", title: "Secure setup details", items: [{ label: "Expires", value: formattedExpiry }, { label: "Role", value: input.role }] },
      { type: "callout", title: "Security note", text: "Do not share this link. If you were not expecting this email, you can ignore it." },
    ],
  });
}
