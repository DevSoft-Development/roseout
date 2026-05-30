import { resolveEmailSender, normalizeEmailDepartment } from "./brand";
export { resolveEmailSender, normalizeEmailDepartment, THEOUTHAVEN_BRAND } from "./brand";
export type { EmailDepartment as EmailSenderDepartment } from "./types";

export const DEFAULT_EMAIL_ADDRESS = "concierge@theouthaven.com";

export function getEmailSenderDepartment(department?: string | null) {
  return normalizeEmailDepartment(department);
}

export function getEmailDisplayName(department?: string | null): string {
  return resolveEmailSender(department).fromName;
}

export function getEmailFrom(department?: string | null): string {
  return resolveEmailSender(department).from;
}

export function getEmailReplyTo(department?: string | null): string {
  return resolveEmailSender(department).replyTo;
}
