import { renderBrandedEmail } from "./render";
import type { EmailAlertItem, EmailCta, EmailInfoItem, EmailMetric, EmailSection, RenderedEmail, EmailDepartment, RecipientType, EmailSenderKey, EmailVariant } from "./types";
import { formatEmailValue } from "./types";

export type CommonTemplateInput = {
  firstName?: string | null; name?: string | null; role?: string | null; url?: string | null; ctaUrl?: string | null;
  subject?: string | null; heading?: string | null; preview?: string | null; intro?: string | null; message?: string | null; body?: string | null;
  code?: string | number | null; expiresAt?: string | null; locationName?: string | null; address?: string | null; date?: string | null; time?: string | null;
  partySize?: string | number | null; confirmationCode?: string | null; email?: string | null; phone?: string | null;
  items?: EmailInfoItem[]; metrics?: EmailMetric[]; alerts?: EmailAlertItem[]; sections?: EmailSection[]; cta?: EmailCta; secondaryCta?: EmailCta; [key: string]: unknown;
};

type TemplateDefaults = { group: string; senderKey: EmailSenderKey; department: EmailDepartment; recipientType: RecipientType; variant: EmailVariant; subject: string; heading: string; intro: string; cta: string; marketing?: boolean };
const site = "https://theouthaven.com";
function title(key: string) { return key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()).replace(/Vip/g, "VIP").replace(/Roi/g, "ROI").replace(/Sms/g, "SMS").replace(/Qa/g, "QA"); }
function text(value: unknown, fallback = "Not provided") { return formatEmailValue(value as string | number | null | undefined, fallback); }
function ctaUrl(input: CommonTemplateInput, fallback = `${site}/dashboard`) { return String(input.cta?.url || input.ctaUrl || input.url || fallback); }
function details(input: CommonTemplateInput, key: string): EmailInfoItem[] { return input.items || [
  { label: "Template", value: key }, { label: "Location", value: input.locationName }, { label: "Date", value: input.date }, { label: "Time", value: input.time }, { label: "Party size", value: input.partySize }, { label: "Confirmation", value: input.confirmationCode },
].filter((i) => i.value !== undefined && i.value !== null && String(i.value).trim() !== ""); }
function createSections(input: CommonTemplateInput, key: string, defaults: TemplateDefaults): EmailSection[] {
  if (input.sections?.length) return input.sections;
  const sections: EmailSection[] = [{ type: "paragraph", text: text(input.body || input.message || defaults.intro) }];
  if (input.code) sections.push({ type: "highlightCard", title: "Secure code", text: String(input.code), tone: "premium" });
  const itemList = details(input, key);
  if (itemList.length) sections.push({ type: "keyValueGrid", title: "Operational details", items: itemList });
  if (input.locationName) sections.push({ type: "locationCard", name: String(input.locationName), address: input.address ? String(input.address) : undefined });
  if (input.email || input.phone || input.name) sections.push({ type: "customerCard", name: input.name || input.firstName || undefined, email: input.email || undefined, phone: input.phone || undefined });
  if (input.metrics?.length || defaults.variant === "digest") sections.push({ type: "digestSummary", title: "Digest summary", metrics: input.metrics || [{ label: "Items to review", value: 0 }], alerts: input.alerts, recommendedActions: [{ label: "Open dashboard", url: ctaUrl(input, `${site}/admin/dashboard`) }] });
  else if (input.alerts?.length) sections.push({ type: "alertList", title: "Alerts", alerts: input.alerts });
  if (defaults.recipientType === "admin" || defaults.recipientType === "location_owner") sections.push({ type: "actionList", actions: [{ label: "Review in dashboard", detail: "Open the related workspace to review details and take the next step.", url: ctaUrl(input, `${site}/admin/dashboard`) }] });
  return sections;
}
export function createStandardEmail(key: string, defaults: TemplateDefaults, input: CommonTemplateInput = {}): RenderedEmail {
  return renderBrandedEmail({ templateKey: key, senderKey: defaults.senderKey, department: defaults.department, recipientType: defaults.recipientType, variant: defaults.variant, subject: text(input.subject, defaults.subject), preview: text(input.preview, defaults.intro), heading: text(input.heading, defaults.heading), eyebrow: title(key), intro: text(input.intro, defaults.intro), sections: createSections(input, key, defaults), primaryCta: input.cta || { label: defaults.cta, url: ctaUrl(input, defaults.recipientType === "admin" ? `${site}/admin/dashboard` : `${site}/dashboard`) }, secondaryCta: input.secondaryCta, marketing: defaults.marketing, footerNote: defaults.marketing ? "You can manage preferences or unsubscribe from non-transactional emails at any time." : undefined });
}
function defaultsFor(key: string): TemplateDefaults {
  let group = "customer", senderKey: EmailSenderKey = "customer_account", department: EmailDepartment = "account", recipientType: RecipientType = "user", variant: EmailVariant = "customer", cta = "Open TheOutHaven";
  if (key.startsWith("user_")) { group = "customer"; senderKey = "customer_account"; department = "account"; recipientType = "user"; variant = "customer"; cta = "Open TheOutHaven"; }
  else if (key.startsWith("location_vip_")) { group = "vip"; senderKey = "vip"; department = "marketing"; recipientType = "marketing"; variant = "marketing"; cta = "View VIP Perk"; }
  else if (key.includes("offer") || key.includes("happy_hour") || key.includes("brunch") || key.includes("weekend_special") || key.includes("date_night_offer")) { group = "offers"; senderKey = "offers"; department = "marketing"; recipientType = "marketing"; variant = "marketing"; cta = "View Offer"; }
  else if (key.startsWith("theouthaven_")) { group = "picks"; senderKey = "picks"; department = "marketing"; recipientType = "marketing"; variant = "marketing"; cta = "Explore Picks"; }
  else if (key.includes("event") || key.includes("party") || key.includes("group_outing") || key.includes("package")) { group = "events"; senderKey = "events"; department = "marketing"; recipientType = "marketing"; variant = "marketing"; cta = "View Event Details"; }
  if (key.startsWith("location_") && !["vip","offers","events"].includes(group)) { group = "business"; senderKey = "business_owner"; department = "locations"; recipientType = "location_owner"; variant = key.includes("digest") || key.includes("report") ? "digest" : "business"; cta = "Open Business Dashboard"; }
  if (key.startsWith("reservation_")) { group = "reservation"; senderKey = "reservations"; department = "reservations"; recipientType = key.endsWith("owner") || key.includes("_owner") || key.includes("summary") || key.includes("provider") ? "location_owner" : "user"; variant = key.includes("summary") ? "digest" : "reservation"; cta = "View Reservation"; }
  if (key.startsWith("support_")) { group = "support"; senderKey = "support"; department = "support"; recipientType = key.includes("business") ? "location_owner" : "user"; variant = "support"; cta = "View Support Request"; }
  if (key.startsWith("billing_")) { group = "billing"; senderKey = "billing"; department = "billing"; recipientType = "location_owner"; variant = "billing"; cta = "Open Billing"; }
  if (key.startsWith("security_")) { group = "security"; senderKey = "security"; department = "security"; recipientType = "user"; variant = "security"; cta = "Review Security"; }
  if (key.startsWith("admin_") || key.startsWith("superadmin_")) { group = "admin"; senderKey = "admin"; department = "admin"; recipientType = "admin"; variant = key.includes("digest") || key.includes("dashboard") ? "digest" : "admin"; cta = "Open Admin Dashboard"; }
  const t = title(key); const marketing = ["vip", "offers", "picks", "events"].includes(group);
  return { group, senderKey, department, recipientType, variant, subject: `TheOutHaven: ${t}`, heading: t, intro: `${t} is ready for review in TheOutHaven.`, cta, marketing };
}
export const REQUIRED_EMAIL_TEMPLATE_KEYS = [
"user_email_verification","user_password_reset","user_welcome","user_signup_confirmation","user_outing_saved","user_outing_reminder","user_outing_completed_feedback","user_offer_claim_confirmation","user_vip_signup_confirmation","user_event_lead_confirmation","user_private_feedback_thank_you","user_review_invitation_verified","user_review_submitted","user_support_ticket_created","user_support_ticket_updated",
"location_vip_welcome_email","location_vip_birthday_perk_email","location_vip_special_access_email","location_vip_thank_you_email","location_birthday_offer_email","location_weekend_special_email","location_brunch_special_email","location_happy_hour_email","location_new_menu_package_email","location_offer_reminder_email","location_first_time_visitor_offer_email","location_date_night_offer_email",
"theouthaven_weekend_picks","theouthaven_featured_locations","theouthaven_date_night_picks","theouthaven_local_guide","theouthaven_new_places_near_you","theouthaven_saved_search_followup","location_private_event_package_email","location_birthday_package_email","location_group_outing_email","location_holiday_party_email","location_live_event_promo_email","location_event_offer_email",
"location_growth_pro_welcome","location_claim_received","location_claim_approved","location_claim_rejected","location_claim_more_info_needed","location_profile_incomplete","location_branding_updated","location_menu_page_published","location_qr_kit_generated","location_private_event_lead_created","location_private_event_lead_reminder","location_reservation_request_created","location_reservation_modified","location_reservation_cancelled","location_vip_signup_created","location_offer_claim_created","location_private_feedback_created","location_verified_review_created","location_sms_credits_low","location_sms_credits_empty","location_campaign_approved","location_campaign_rejected","location_custom_message_needs_edits","location_daily_activity_digest","location_weekly_growth_digest","location_monthly_roi_report",
"reservation_request_received_customer","reservation_request_received_owner","reservation_confirmed_customer","reservation_confirmed_owner","reservation_reminder_customer","reservation_modified_customer","reservation_modified_owner","reservation_cancelled_customer","reservation_cancelled_owner","reservation_waitlist_customer","reservation_waitlist_owner","reservation_checked_in_owner","reservation_completed_review_eligible","reservation_daily_summary","reservation_weekly_summary","reservation_provider_error",
"support_ticket_created_customer","support_ticket_updated_customer","support_ticket_created_business","support_ticket_updated_business","support_agent_reply","support_issue_resolved","billing_payment_failed","billing_subscription_activated","billing_subscription_cancelled","billing_trial_ending","billing_sms_addon_activated","billing_sms_addon_cancelled","billing_invoice_available","billing_payment_method_needed","security_password_changed","security_email_changed","security_new_login","security_suspicious_activity","security_account_recovery",
"superadmin_daily_dashboard","superadmin_weekly_dashboard","superadmin_cron_digest","superadmin_search_health_digest","superadmin_failed_email_delivery","superadmin_security_alert","superadmin_data_quality_digest","superadmin_growth_pro_digest","admin_new_support_ticket","admin_new_claim_submitted","admin_claim_needs_review","admin_reservation_issue","admin_location_data_issue","admin_private_event_lead_alert","admin_notification_delivery_failed","admin_messaging_approval_needed","admin_low_rating_feedback","admin_payment_failure","admin_growth_pro_setup_incomplete",
"password_setup_invite","password_reset","email_verification","login_code","suspicious_login_alert"] as const;
export type EmailTemplateBuilder = (input?: CommonTemplateInput) => RenderedEmail;
export const EMAIL_TEMPLATE_DEFAULTS = Object.fromEntries(REQUIRED_EMAIL_TEMPLATE_KEYS.map((key) => [key, defaultsFor(key)])) as Record<string, TemplateDefaults>;
export const EMAIL_TEMPLATE_BUILDERS = Object.fromEntries(REQUIRED_EMAIL_TEMPLATE_KEYS.map((key) => [key, (input: CommonTemplateInput = {}) => createStandardEmail(key, EMAIL_TEMPLATE_DEFAULTS[key], input)])) as Record<(typeof REQUIRED_EMAIL_TEMPLATE_KEYS)[number], EmailTemplateBuilder>;
export const passwordSetupInviteEmail = EMAIL_TEMPLATE_BUILDERS.password_setup_invite;
export const reservationDailySummaryEmail = EMAIL_TEMPLATE_BUILDERS.reservation_daily_summary;
export const reservationWeeklySummaryEmail = EMAIL_TEMPLATE_BUILDERS.reservation_weekly_summary;
export const superadminDailyDashboardEmail = EMAIL_TEMPLATE_BUILDERS.superadmin_daily_dashboard;
export const superadminWeeklyDashboardEmail = EMAIL_TEMPLATE_BUILDERS.superadmin_weekly_dashboard;
export const locationWeeklyPerformanceEmail = EMAIL_TEMPLATE_BUILDERS.location_weekly_growth_digest;
