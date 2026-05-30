import { sendBrandedEmail } from "./sender";
import type { CommonTemplateInput } from "./templates";

type AlertParams = CommonTemplateInput & { to?: string | string[] | null };
const adminTo = (input: AlertParams) => input.to || process.env.SUPERADMIN_EMAIL || process.env.ADMIN_ALERT_EMAIL || null;

export function sendSuperadminCriticalErrorEmail(input: AlertParams) { return sendBrandedEmail({ to: adminTo(input), templateKey: "superadmin_critical_error", input, department: "system" }); }
export function sendSuperadminSecurityAlertEmail(input: AlertParams) { return sendBrandedEmail({ to: adminTo(input), templateKey: "superadmin_security_alert", input, department: "security" }); }
export function sendSuperadminFailedEmailDeliveryEmail(input: AlertParams) { return sendBrandedEmail({ to: adminTo(input), templateKey: "superadmin_failed_email_delivery", input, department: "system" }); }
export function sendAdminReservationIssueEmail(input: AlertParams) { return sendBrandedEmail({ to: adminTo(input), templateKey: "admin_reservation_issue", input, department: "reservations" }); }
export function sendAdminLocationDataIssueEmail(input: AlertParams) { return sendBrandedEmail({ to: adminTo(input), templateKey: "admin_location_data_issue", input, department: "admin" }); }
export function sendSupportTicketEscalatedEmail(input: AlertParams) { return sendBrandedEmail({ to: adminTo(input), templateKey: "support_ticket_escalated", input, department: "support" }); }
