import { EMAIL_TEMPLATE_BUILDERS, type CommonTemplateInput } from "./templates";
import type { RenderedEmail } from "./types";

export const EMAIL_TEMPLATE_KEYS = Object.keys(EMAIL_TEMPLATE_BUILDERS) as Array<keyof typeof EMAIL_TEMPLATE_BUILDERS>;
export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATE_BUILDERS;

export const EMAIL_TEMPLATE_GROUPS = {
  auth: ["password_setup_invite", "password_reset", "email_verification", "login_code", "suspicious_login_alert"],
  users: ["user_welcome", "user_reservation_confirmation", "user_reservation_reminder", "user_reservation_cancelled", "user_plan_saved", "user_support_ticket_created", "user_support_ticket_updated"],
  admins: ["admin_welcome", "admin_password_setup", "admin_new_support_ticket", "admin_new_claim_submitted", "admin_claim_needs_review", "admin_reservation_issue", "admin_location_data_issue"],
  locations: ["location_owner_welcome", "location_claim_received", "location_claim_approved", "location_claim_rejected", "location_claim_more_info_needed", "location_reservation_received", "location_reservation_cancelled", "location_profile_incomplete", "location_weekly_performance"],
  claims: ["claim_code_created", "claim_mailer_ready", "claim_expired_or_invalid_code"],
  support: ["support_ticket_created_internal", "support_ticket_assigned", "support_ticket_replied", "support_ticket_resolved", "support_ticket_escalated"],
  reservations: ["reservation_created_system", "reservation_provider_error", "reservation_daily_summary", "reservation_weekly_summary"],
  upsell: ["location_free_plan_welcome", "location_pro_plan_welcome", "location_upgrade_opportunity", "location_trial_ending", "location_subscription_past_due", "location_subscription_cancelled"],
  superadmin: ["superadmin_daily_dashboard", "superadmin_weekly_dashboard", "superadmin_critical_error", "superadmin_failed_email_delivery", "superadmin_security_alert", "superadmin_data_quality_digest"],
  marketing: ["beta_tester_invite", "marketing_announcement", "saved_search_followup", "abandoned_reservation"],
} as const satisfies Record<string, readonly EmailTemplateKey[]>;

export function isEmailTemplateKey(key: string): key is EmailTemplateKey {
  return key in EMAIL_TEMPLATE_BUILDERS;
}

export function getEmailTemplate(key: EmailTemplateKey | string, input: CommonTemplateInput = {}): RenderedEmail {
  if (!isEmailTemplateKey(String(key))) throw new Error(`Unknown email template key: ${key}`);
  return EMAIL_TEMPLATE_BUILDERS[String(key) as EmailTemplateKey](input);
}
