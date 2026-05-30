export type { EmailDepartment } from "./types";
export { DEPARTMENT_LABELS as EMAIL_DEPARTMENTS, normalizeEmailDepartment as getEmailDepartment } from "./brand";
import { resolveEmailSender } from "./brand";

export function getEmailSignature(department?: string | null): string {
  return resolveEmailSender(department).signature;
}
