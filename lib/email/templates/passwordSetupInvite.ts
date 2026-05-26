export function passwordSetupInviteTemplate(input: {
  first_name: string;
  invite_url: string;
  expires_at: string;
  role: string;
  support_email: string;
}) {
  const intro = input.role === "owner"
    ? "Your TheOutHaven owner account has been created so you can manage your location, claims, plans, and customer engagement."
    : "Your TheOutHaven account has been created.";

  return {
    subject: "Create your TheOutHaven password",
    html: `<p>Hi ${input.first_name},</p><p>${intro} To keep your account secure, please create your own password using the link below.</p><p><a href="${input.invite_url}">Create My Password</a></p><p>This link expires on ${input.expires_at}. For your security, do not share this email or link with anyone.</p><p>If you did not expect this invitation, you can ignore this email or contact ${input.support_email}.</p><p>Welcome to TheOutHaven,<br/>The TheOutHaven Team</p>`,
  };
}
