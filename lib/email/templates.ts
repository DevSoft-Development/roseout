import { renderBrandedEmail } from "./render";
import type { EmailAlertItem, EmailCta, EmailInfoItem, EmailMetric, EmailSection, RenderedEmail, EmailDepartment, RecipientType } from "./types";
import { formatEmailValue } from "./types";

export type CommonTemplateInput = {
  firstName?: string | null;
  name?: string | null;
  role?: string | null;
  url?: string | null;
  ctaUrl?: string | null;
  subject?: string | null;
  heading?: string | null;
  preview?: string | null;
  intro?: string | null;
  message?: string | null;
  body?: string | null;
  code?: string | number | null;
  expiresAt?: string | null;
  items?: EmailInfoItem[];
  metrics?: EmailMetric[];
  alerts?: EmailAlertItem[];
  sections?: EmailSection[];
  cta?: EmailCta;
  secondaryCta?: EmailCta;
  [key: string]: unknown;
};

function text(value: unknown, fallback = "Not provided") { return formatEmailValue(value as string | number | null | undefined, fallback); }
function url(input: CommonTemplateInput, fallback = "https://theouthaven.com") { return String(input.cta?.url || input.ctaUrl || input.url || fallback); }
function name(input: CommonTemplateInput) { return text(input.firstName || input.name, "there"); }
function prettyKey(key: string) { return key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()); }

function reservationItems(input: CommonTemplateInput): EmailInfoItem[] {
  return input.items || [
    { label: "Location", value: input.locationName as string || input.location as string },
    { label: "Date", value: input.date as string || input.reservationDate as string },
    { label: "Time", value: input.time as string || input.reservationTime as string },
    { label: "Party size", value: input.partySize as string | number },
    { label: "Confirmation code", value: input.confirmationCode as string },
  ];
}

export function createStandardEmail(key: string, defaults: { department: EmailDepartment; recipientType: RecipientType; subject: string; heading: string; intro: string; cta: string; marketing?: boolean }, input: CommonTemplateInput = {}): RenderedEmail {
  const isReservation = key.includes("reservation");
  const isDigest = key.includes("summary") || key.includes("dashboard") || key.includes("digest") || key.includes("performance");
  const sections: EmailSection[] = input.sections || [];
  if (!sections.length) {
    if (input.body || input.message) sections.push({ type: "paragraph", text: text(input.body || input.message) });
    if (input.code) sections.push({ type: "callout", title: "Verification code", text: String(input.code) });
    if (isReservation) sections.push({ type: "infoList", title: "Reservation details", items: reservationItems(input) });
    else if (input.items?.length) sections.push({ type: "infoList", title: "Details", items: input.items });
    if (input.metrics?.length || isDigest) sections.push({ type: "statGrid", title: isDigest ? "Operating metrics" : "Metrics", metrics: input.metrics || [] });
    if (input.alerts?.length) sections.push({ type: "alertList", title: "Alerts", alerts: input.alerts });
    if (!sections.length) sections.push({ type: "paragraph", text: `Hi ${name(input)}, ${defaults.intro}` });
  }
  return renderBrandedEmail({
    department: (input.department as EmailDepartment) || defaults.department,
    recipientType: defaults.recipientType,
    subject: text(input.subject, defaults.subject),
    preview: text(input.preview, defaults.intro),
    heading: text(input.heading, defaults.heading),
    eyebrow: prettyKey(key),
    intro: text(input.intro, defaults.intro),
    sections,
    cta: input.cta || { label: defaults.cta, url: url(input) },
    secondaryCta: input.secondaryCta,
    marketing: defaults.marketing || defaults.department === "marketing" || defaults.department === "upsell",
  });
}

export type PasswordSetupInviteEmailInput = CommonTemplateInput;
export function passwordSetupInviteEmail(input: CommonTemplateInput = {}): RenderedEmail {
  const role = String(input.role || "user").toLowerCase();
  const isAdmin = role === "admin" || role === "superadmin";
  const isOwner = role === "location_owner" || role === "owner";
  return createStandardEmail("password_setup_invite", { department: isAdmin ? "admin" : "account", recipientType: isAdmin ? "admin" : isOwner ? "location_owner" : "user", subject: isAdmin ? "Set up your TheOutHaven admin password" : isOwner ? "Set up your TheOutHaven owner account" : "Create your TheOutHaven password", heading: isAdmin ? "Your admin access is ready" : isOwner ? "Your owner access is ready" : "Welcome to TheOutHaven", intro: isAdmin ? "Create your password to access admin tools, manage operational workflows, and keep TheOutHaven running smoothly." : isOwner ? "Create your password to manage your location profile, claims, reservations, and guest engagement." : "Your TheOutHaven account is ready. Create your password to save outings, manage reservations, and get personalized recommendations.", cta: isAdmin ? "Set Up Admin Access" : isOwner ? "Set Up Owner Access" : "Create Password" }, input);
}

export type PasswordResetEmailInput = CommonTemplateInput;
export function passwordResetEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("password_reset", { department: "security", recipientType: "user", subject: "Reset your TheOutHaven password", heading: "Reset your password", intro: "Use this secure link to reset your TheOutHaven password. If you did not request this, you can ignore this email.", cta: "Reset Password", marketing: false }, input);
}

export type EmailVerificationEmailInput = CommonTemplateInput;
export function emailVerificationEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("email_verification", { department: "account", recipientType: "user", subject: "Verify your TheOutHaven email", heading: "Verify your email", intro: "Confirm your email address so we can keep your TheOutHaven account secure and up to date.", cta: "Verify Email", marketing: false }, input);
}

export type LoginCodeEmailInput = CommonTemplateInput;
export function loginCodeEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("login_code", { department: "security", recipientType: "user", subject: "Your TheOutHaven login code", heading: "Your login code", intro: "Use the verification code below to finish signing in to TheOutHaven.", cta: "Verify Login", marketing: false }, input);
}

export type SuspiciousLoginAlertEmailInput = CommonTemplateInput;
export function suspiciousLoginAlertEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("suspicious_login_alert", { department: "security", recipientType: "user", subject: "Security alert for your TheOutHaven account", heading: "Review account security", intro: "We noticed sign-in activity that may need your attention. Review the details below.", cta: "Review Account Security", marketing: false }, input);
}

export type UserWelcomeEmailInput = CommonTemplateInput;
export function userWelcomeEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("user_welcome", { department: "account", recipientType: "user", subject: "Welcome to TheOutHaven", heading: "Welcome to TheOutHaven", intro: "Welcome to TheOutHaven — your place to discover better nights out, plan memorable outings, and save the spots that match your vibe.", cta: "Start Planning", marketing: false }, input);
}

export type UserReservationConfirmationEmailInput = CommonTemplateInput;
export function userReservationConfirmationEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("user_reservation_confirmation", { department: "reservations", recipientType: "user", subject: "Your TheOutHaven reservation was received", heading: "Reservation request received", intro: "Your reservation request has been received. You can review the details below and check your reservation status anytime.", cta: "View Reservation", marketing: false }, input);
}

export type UserReservationReminderEmailInput = CommonTemplateInput;
export function userReservationReminderEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("user_reservation_reminder", { department: "reservations", recipientType: "user", subject: "Your TheOutHaven reservation is coming up", heading: "Your reservation is coming up", intro: "A quick reminder for your upcoming TheOutHaven reservation. Review the details before you head out.", cta: "View Reservation", marketing: false }, input);
}

export type UserReservationCancelledEmailInput = CommonTemplateInput;
export function userReservationCancelledEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("user_reservation_cancelled", { department: "reservations", recipientType: "user", subject: "Your TheOutHaven reservation was cancelled", heading: "Reservation cancelled", intro: "Your reservation has been cancelled. You can explore other places and plan another outing anytime.", cta: "Explore Other Places", marketing: false }, input);
}

export type UserPlanSavedEmailInput = CommonTemplateInput;
export function userPlanSavedEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("user_plan_saved", { department: "account", recipientType: "user", subject: "TheOutHaven: User Plan Saved", heading: "User Plan Saved", intro: "Here is the latest TheOutHaven update for user plan saved.", cta: "Open Dashboard", marketing: false }, input);
}

export type UserSupportTicketCreatedEmailInput = CommonTemplateInput;
export function userSupportTicketCreatedEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("user_support_ticket_created", { department: "support", recipientType: "user", subject: "We received your TheOutHaven support request", heading: "Support request received", intro: "We received your request. The TheOutHaven Support team will review it and follow up as soon as possible.", cta: "View Ticket", marketing: false }, input);
}

export type UserSupportTicketUpdatedEmailInput = CommonTemplateInput;
export function userSupportTicketUpdatedEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("user_support_ticket_updated", { department: "support", recipientType: "user", subject: "TheOutHaven: User Support Ticket Updated", heading: "User Support Ticket Updated", intro: "Here is the latest TheOutHaven update for user support ticket updated.", cta: "Open Dashboard", marketing: false }, input);
}

export type AdminWelcomeEmailInput = CommonTemplateInput;
export function adminWelcomeEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("admin_welcome", { department: "admin", recipientType: "admin", subject: "Your TheOutHaven admin access is ready", heading: "Admin access is ready", intro: "Your TheOutHaven admin access is ready. Use your dashboard to review platform activity, manage operational workflows, and keep the experience running smoothly.", cta: "Open Admin Dashboard", marketing: false }, input);
}

export type AdminPasswordSetupEmailInput = CommonTemplateInput;
export function adminPasswordSetupEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("admin_password_setup", { department: "admin", recipientType: "admin", subject: "Set up your TheOutHaven admin access", heading: "Set up admin access", intro: "Create your secure password to access TheOutHaven admin tools and operational workflows.", cta: "Set Up Admin Access", marketing: false }, input);
}

export type AdminNewSupportTicketEmailInput = CommonTemplateInput;
export function adminNewSupportTicketEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("admin_new_support_ticket", { department: "support", recipientType: "admin", subject: "TheOutHaven: Admin New Support Ticket", heading: "Admin New Support Ticket", intro: "Here is the latest TheOutHaven update for admin new support ticket.", cta: "Open Dashboard", marketing: false }, input);
}

export type AdminNewClaimSubmittedEmailInput = CommonTemplateInput;
export function adminNewClaimSubmittedEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("admin_new_claim_submitted", { department: "admin", recipientType: "admin", subject: "New TheOutHaven claim submitted", heading: "New claim submitted", intro: "A new business or location claim is ready for admin review.", cta: "Review Claim", marketing: false }, input);
}

export type AdminClaimNeedsReviewEmailInput = CommonTemplateInput;
export function adminClaimNeedsReviewEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("admin_claim_needs_review", { department: "admin", recipientType: "admin", subject: "TheOutHaven: Admin Claim Needs Review", heading: "Admin Claim Needs Review", intro: "Here is the latest TheOutHaven update for admin claim needs review.", cta: "Open Dashboard", marketing: false }, input);
}

export type AdminReservationIssueEmailInput = CommonTemplateInput;
export function adminReservationIssueEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("admin_reservation_issue", { department: "reservations", recipientType: "admin", subject: "TheOutHaven: Admin Reservation Issue", heading: "Admin Reservation Issue", intro: "Here is the latest TheOutHaven update for admin reservation issue.", cta: "Open Dashboard", marketing: false }, input);
}

export type AdminLocationDataIssueEmailInput = CommonTemplateInput;
export function adminLocationDataIssueEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("admin_location_data_issue", { department: "admin", recipientType: "admin", subject: "TheOutHaven: Admin Location Data Issue", heading: "Admin Location Data Issue", intro: "Here is the latest TheOutHaven update for admin location data issue.", cta: "Open Dashboard", marketing: false }, input);
}

export type LocationOwnerWelcomeEmailInput = CommonTemplateInput;
export function locationOwnerWelcomeEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_owner_welcome", { department: "locations", recipientType: "location_owner", subject: "Your TheOutHaven location dashboard is ready", heading: "Location dashboard ready", intro: "Your location dashboard is ready. You can now keep your profile accurate, manage key business details, and see how guests are engaging with your location.", cta: "Open Location Dashboard", marketing: false }, input);
}

export type LocationClaimReceivedEmailInput = CommonTemplateInput;
export function locationClaimReceivedEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_claim_received", { department: "claims", recipientType: "location_owner", subject: "We received your TheOutHaven location claim", heading: "Location claim received", intro: "We received your location claim. Our team will review the details and connect your account to the correct location if everything matches.", cta: "View Claim Status", marketing: false }, input);
}

export type LocationClaimApprovedEmailInput = CommonTemplateInput;
export function locationClaimApprovedEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_claim_approved", { department: "claims", recipientType: "location_owner", subject: "Your TheOutHaven claim was approved", heading: "Claim approved", intro: "Your claim was approved. You can now manage your location profile and keep your details accurate for guests.", cta: "Manage Location", marketing: false }, input);
}

export type LocationClaimRejectedEmailInput = CommonTemplateInput;
export function locationClaimRejectedEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_claim_rejected", { department: "claims", recipientType: "location_owner", subject: "Update on your TheOutHaven claim", heading: "Claim not approved", intro: "We could not approve this claim with the information provided. Contact support if you believe this needs another review.", cta: "Contact Support", marketing: false }, input);
}

export type LocationClaimMoreInfoNeededEmailInput = CommonTemplateInput;
export function locationClaimMoreInfoNeededEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_claim_more_info_needed", { department: "locations", recipientType: "location_owner", subject: "TheOutHaven: Location Claim More Info Needed", heading: "Location Claim More Info Needed", intro: "Here is the latest TheOutHaven update for location claim more info needed.", cta: "Open Dashboard", marketing: false }, input);
}

export type LocationReservationReceivedEmailInput = CommonTemplateInput;
export function locationReservationReceivedEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_reservation_received", { department: "locations", recipientType: "location_owner", subject: "TheOutHaven: Location Reservation Received", heading: "Location Reservation Received", intro: "Here is the latest TheOutHaven update for location reservation received.", cta: "Open Dashboard", marketing: false }, input);
}

export type LocationReservationCancelledEmailInput = CommonTemplateInput;
export function locationReservationCancelledEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_reservation_cancelled", { department: "locations", recipientType: "location_owner", subject: "TheOutHaven: Location Reservation Cancelled", heading: "Location Reservation Cancelled", intro: "Here is the latest TheOutHaven update for location reservation cancelled.", cta: "Open Dashboard", marketing: false }, input);
}

export type LocationProfileIncompleteEmailInput = CommonTemplateInput;
export function locationProfileIncompleteEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_profile_incomplete", { department: "locations", recipientType: "location_owner", subject: "TheOutHaven: Location Profile Incomplete", heading: "Location Profile Incomplete", intro: "Here is the latest TheOutHaven update for location profile incomplete.", cta: "Open Dashboard", marketing: false }, input);
}

export type LocationWeeklyPerformanceEmailInput = CommonTemplateInput;
export function locationWeeklyPerformanceEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_weekly_performance", { department: "locations", recipientType: "location_owner", subject: "TheOutHaven: Location Weekly Performance", heading: "Location Weekly Performance", intro: "Here is the latest TheOutHaven update for location weekly performance.", cta: "Open Dashboard", marketing: false }, input);
}

export type ClaimCodeCreatedEmailInput = CommonTemplateInput;
export function claimCodeCreatedEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("claim_code_created", { department: "admin", recipientType: "admin", subject: "TheOutHaven: Claim Code Created", heading: "Claim Code Created", intro: "Here is the latest TheOutHaven update for claim code created.", cta: "Open Dashboard", marketing: false }, input);
}

export type ClaimMailerReadyEmailInput = CommonTemplateInput;
export function claimMailerReadyEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("claim_mailer_ready", { department: "admin", recipientType: "admin", subject: "TheOutHaven: Claim Mailer Ready", heading: "Claim Mailer Ready", intro: "Here is the latest TheOutHaven update for claim mailer ready.", cta: "Open Dashboard", marketing: false }, input);
}

export type ClaimExpiredOrInvalidCodeEmailInput = CommonTemplateInput;
export function claimExpiredOrInvalidCodeEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("claim_expired_or_invalid_code", { department: "admin", recipientType: "admin", subject: "TheOutHaven: Claim Expired Or Invalid Code", heading: "Claim Expired Or Invalid Code", intro: "Here is the latest TheOutHaven update for claim expired or invalid code.", cta: "Open Dashboard", marketing: false }, input);
}

export type SupportTicketCreatedInternalEmailInput = CommonTemplateInput;
export function supportTicketCreatedInternalEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("support_ticket_created_internal", { department: "support", recipientType: "admin", subject: "New TheOutHaven support ticket", heading: "New support ticket", intro: "A new support ticket was opened and is ready for review.", cta: "Open Ticket", marketing: false }, input);
}

export type SupportTicketAssignedEmailInput = CommonTemplateInput;
export function supportTicketAssignedEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("support_ticket_assigned", { department: "support", recipientType: "admin", subject: "TheOutHaven: Support Ticket Assigned", heading: "Support Ticket Assigned", intro: "Here is the latest TheOutHaven update for support ticket assigned.", cta: "Open Dashboard", marketing: false }, input);
}

export type SupportTicketRepliedEmailInput = CommonTemplateInput;
export function supportTicketRepliedEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("support_ticket_replied", { department: "support", recipientType: "admin", subject: "TheOutHaven: Support Ticket Replied", heading: "Support Ticket Replied", intro: "Here is the latest TheOutHaven update for support ticket replied.", cta: "Open Dashboard", marketing: false }, input);
}

export type SupportTicketResolvedEmailInput = CommonTemplateInput;
export function supportTicketResolvedEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("support_ticket_resolved", { department: "support", recipientType: "admin", subject: "TheOutHaven: Support Ticket Resolved", heading: "Support Ticket Resolved", intro: "Here is the latest TheOutHaven update for support ticket resolved.", cta: "Open Dashboard", marketing: false }, input);
}

export type SupportTicketEscalatedEmailInput = CommonTemplateInput;
export function supportTicketEscalatedEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("support_ticket_escalated", { department: "support", recipientType: "admin", subject: "TheOutHaven support ticket escalated", heading: "Support escalation", intro: "A support ticket was escalated and needs admin attention.", cta: "Review Escalation", marketing: false }, input);
}

export type ReservationCreatedSystemEmailInput = CommonTemplateInput;
export function reservationCreatedSystemEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("reservation_created_system", { department: "reservations", recipientType: "admin", subject: "TheOutHaven: Reservation Created System", heading: "Reservation Created System", intro: "Here is the latest TheOutHaven update for reservation created system.", cta: "Open Dashboard", marketing: false }, input);
}

export type ReservationProviderErrorEmailInput = CommonTemplateInput;
export function reservationProviderErrorEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("reservation_provider_error", { department: "reservations", recipientType: "admin", subject: "TheOutHaven: Reservation Provider Error", heading: "Reservation Provider Error", intro: "Here is the latest TheOutHaven update for reservation provider error.", cta: "Open Dashboard", marketing: false }, input);
}

export type ReservationDailySummaryEmailInput = CommonTemplateInput;
export function reservationDailySummaryEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("reservation_daily_summary", { department: "reservations", recipientType: "admin", subject: "TheOutHaven reservation daily summary", heading: "Reservation daily summary", intro: "Here is today’s reservations operating snapshot, including volume, status, and time-sensitive items.", cta: "Open Reservations Dashboard", marketing: false }, input);
}

export type ReservationWeeklySummaryEmailInput = CommonTemplateInput;
export function reservationWeeklySummaryEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("reservation_weekly_summary", { department: "reservations", recipientType: "admin", subject: "TheOutHaven reservation weekly summary", heading: "Reservation weekly summary", intro: "Here is the weekly reservation trend report for TheOutHaven.", cta: "Open Reservations Dashboard", marketing: false }, input);
}

export type LocationFreePlanWelcomeEmailInput = CommonTemplateInput;
export function locationFreePlanWelcomeEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_free_plan_welcome", { department: "plans", recipientType: "location_owner", subject: "TheOutHaven: Location Free Plan Welcome", heading: "Location Free Plan Welcome", intro: "Here is the latest TheOutHaven update for location free plan welcome.", cta: "Open Dashboard", marketing: false }, input);
}

export type LocationProPlanWelcomeEmailInput = CommonTemplateInput;
export function locationProPlanWelcomeEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_pro_plan_welcome", { department: "plans", recipientType: "location_owner", subject: "TheOutHaven: TheOutHaven Partner Plan Welcome", heading: "TheOutHaven Partner Plan Welcome", intro: "Here is the latest TheOutHaven update for TheOutHaven Partner Plan welcome.", cta: "Open Dashboard", marketing: false }, input);
}

export type LocationUpgradeOpportunityEmailInput = CommonTemplateInput;
export function locationUpgradeOpportunityEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_upgrade_opportunity", { department: "upsell", recipientType: "location_owner", subject: "Unlock more from TheOutHaven Partner Plan", heading: "Partner Plan opportunity", intro: "Your location is already discoverable on TheOutHaven. TheOutHaven Partner Plan helps you turn that attention into action with a standalone reservation portal, website embed, analytics, and discovery.", cta: "Activate Partner Plan", marketing: true }, input);
}

export type LocationTrialEndingEmailInput = CommonTemplateInput;
export function locationTrialEndingEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_trial_ending", { department: "locations", recipientType: "location_owner", subject: "TheOutHaven: Location Trial Ending", heading: "Location Trial Ending", intro: "Here is the latest TheOutHaven update for location trial ending.", cta: "Open Dashboard", marketing: false }, input);
}

export type LocationSubscriptionPastDueEmailInput = CommonTemplateInput;
export function locationSubscriptionPastDueEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_subscription_past_due", { department: "locations", recipientType: "location_owner", subject: "TheOutHaven: Location Subscription Past Due", heading: "Location Subscription Past Due", intro: "Here is the latest TheOutHaven update for location subscription past due.", cta: "Open Dashboard", marketing: false }, input);
}

export type LocationSubscriptionCancelledEmailInput = CommonTemplateInput;
export function locationSubscriptionCancelledEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("location_subscription_cancelled", { department: "locations", recipientType: "location_owner", subject: "TheOutHaven: Location Subscription Cancelled", heading: "Location Subscription Cancelled", intro: "Here is the latest TheOutHaven update for location subscription cancelled.", cta: "Open Dashboard", marketing: false }, input);
}

export type SuperadminDailyDashboardEmailInput = CommonTemplateInput;
export function superadminDailyDashboardEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("superadmin_daily_dashboard", { department: "superadmin", recipientType: "superadmin", subject: "TheOutHaven daily operating snapshot", heading: "Daily operating snapshot", intro: "Here is your daily operating snapshot for TheOutHaven, including claims, support, reservations, errors, and time-sensitive items that may need attention.", cta: "Open Superadmin Dashboard", marketing: false }, input);
}

export type SuperadminWeeklyDashboardEmailInput = CommonTemplateInput;
export function superadminWeeklyDashboardEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("superadmin_weekly_dashboard", { department: "superadmin", recipientType: "superadmin", subject: "TheOutHaven weekly executive summary", heading: "Weekly executive summary", intro: "Here is your weekly executive summary across growth, reservations, support, revenue, and operational risks.", cta: "Open Superadmin Dashboard", marketing: false }, input);
}

export type SuperadminCriticalErrorEmailInput = CommonTemplateInput;
export function superadminCriticalErrorEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("superadmin_critical_error", { department: "system", recipientType: "superadmin", subject: "Critical TheOutHaven production error", heading: "Critical production error", intro: "A critical production error was reported and may need immediate attention.", cta: "Open Logs", marketing: false }, input);
}

export type SuperadminFailedEmailDeliveryEmailInput = CommonTemplateInput;
export function superadminFailedEmailDeliveryEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("superadmin_failed_email_delivery", { department: "system", recipientType: "superadmin", subject: "TheOutHaven email delivery failed", heading: "Email delivery failed", intro: "An email failed to send through the provider. Review the delivery details below.", cta: "Review Email Logs", marketing: false }, input);
}

export type SuperadminSecurityAlertEmailInput = CommonTemplateInput;
export function superadminSecurityAlertEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("superadmin_security_alert", { department: "security", recipientType: "superadmin", subject: "TheOutHaven security alert", heading: "Security alert", intro: "A security event was detected for admin or platform access. Review the logs promptly.", cta: "Review Security Logs", marketing: false }, input);
}

export type SuperadminDataQualityDigestEmailInput = CommonTemplateInput;
export function superadminDataQualityDigestEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("superadmin_data_quality_digest", { department: "system", recipientType: "superadmin", subject: "TheOutHaven: Superadmin Data Quality Digest", heading: "Superadmin Data Quality Digest", intro: "Here is the latest TheOutHaven update for superadmin data quality digest.", cta: "Open Dashboard", marketing: false }, input);
}

export type BetaTesterInviteEmailInput = CommonTemplateInput;
export function betaTesterInviteEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("beta_tester_invite", { department: "marketing", recipientType: "marketing", subject: "You’re invited to TheOutHaven beta", heading: "Join TheOutHaven beta", intro: "You are invited to help shape TheOutHaven and discover better nights out before the wider launch.", cta: "Join Beta", marketing: true }, input);
}

export type MarketingAnnouncementEmailInput = CommonTemplateInput;
export function marketingAnnouncementEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("marketing_announcement", { department: "marketing", recipientType: "marketing", subject: "A note from TheOutHaven", heading: "A note from TheOutHaven", intro: "A new TheOutHaven update is ready for you.", cta: "Learn More", marketing: true }, input);
}

export type SavedSearchFollowupEmailInput = CommonTemplateInput;
export function savedSearchFollowupEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("saved_search_followup", { department: "marketing", recipientType: "marketing", subject: "TheOutHaven: Saved Search Followup", heading: "Saved Search Followup", intro: "Here is the latest TheOutHaven update for saved search followup.", cta: "Open Dashboard", marketing: true }, input);
}

export type AbandonedReservationEmailInput = CommonTemplateInput;
export function abandonedReservationEmail(input: CommonTemplateInput = {}): RenderedEmail {
  return createStandardEmail("abandoned_reservation", { department: "reservations", recipientType: "user", subject: "Finish your TheOutHaven reservation", heading: "Finish your reservation", intro: "You started a reservation but did not complete it. Return anytime to finish booking your outing.", cta: "Finish Reservation", marketing: false }, input);
}

export const EMAIL_TEMPLATE_BUILDERS = {
  password_setup_invite: passwordSetupInviteEmail,
  password_reset: passwordResetEmail,
  email_verification: emailVerificationEmail,
  login_code: loginCodeEmail,
  suspicious_login_alert: suspiciousLoginAlertEmail,
  user_welcome: userWelcomeEmail,
  user_reservation_confirmation: userReservationConfirmationEmail,
  user_reservation_reminder: userReservationReminderEmail,
  user_reservation_cancelled: userReservationCancelledEmail,
  user_plan_saved: userPlanSavedEmail,
  user_support_ticket_created: userSupportTicketCreatedEmail,
  user_support_ticket_updated: userSupportTicketUpdatedEmail,
  admin_welcome: adminWelcomeEmail,
  admin_password_setup: adminPasswordSetupEmail,
  admin_new_support_ticket: adminNewSupportTicketEmail,
  admin_new_claim_submitted: adminNewClaimSubmittedEmail,
  admin_claim_needs_review: adminClaimNeedsReviewEmail,
  admin_reservation_issue: adminReservationIssueEmail,
  admin_location_data_issue: adminLocationDataIssueEmail,
  location_owner_welcome: locationOwnerWelcomeEmail,
  location_claim_received: locationClaimReceivedEmail,
  location_claim_approved: locationClaimApprovedEmail,
  location_claim_rejected: locationClaimRejectedEmail,
  location_claim_more_info_needed: locationClaimMoreInfoNeededEmail,
  location_reservation_received: locationReservationReceivedEmail,
  location_reservation_cancelled: locationReservationCancelledEmail,
  location_profile_incomplete: locationProfileIncompleteEmail,
  location_weekly_performance: locationWeeklyPerformanceEmail,
  claim_code_created: claimCodeCreatedEmail,
  claim_mailer_ready: claimMailerReadyEmail,
  claim_expired_or_invalid_code: claimExpiredOrInvalidCodeEmail,
  support_ticket_created_internal: supportTicketCreatedInternalEmail,
  support_ticket_assigned: supportTicketAssignedEmail,
  support_ticket_replied: supportTicketRepliedEmail,
  support_ticket_resolved: supportTicketResolvedEmail,
  support_ticket_escalated: supportTicketEscalatedEmail,
  reservation_created_system: reservationCreatedSystemEmail,
  reservation_provider_error: reservationProviderErrorEmail,
  reservation_daily_summary: reservationDailySummaryEmail,
  reservation_weekly_summary: reservationWeeklySummaryEmail,
  location_free_plan_welcome: locationFreePlanWelcomeEmail,
  location_pro_plan_welcome: locationProPlanWelcomeEmail,
  location_upgrade_opportunity: locationUpgradeOpportunityEmail,
  location_trial_ending: locationTrialEndingEmail,
  location_subscription_past_due: locationSubscriptionPastDueEmail,
  location_subscription_cancelled: locationSubscriptionCancelledEmail,
  superadmin_daily_dashboard: superadminDailyDashboardEmail,
  superadmin_weekly_dashboard: superadminWeeklyDashboardEmail,
  superadmin_critical_error: superadminCriticalErrorEmail,
  superadmin_failed_email_delivery: superadminFailedEmailDeliveryEmail,
  superadmin_security_alert: superadminSecurityAlertEmail,
  superadmin_data_quality_digest: superadminDataQualityDigestEmail,
  beta_tester_invite: betaTesterInviteEmail,
  marketing_announcement: marketingAnnouncementEmail,
  saved_search_followup: savedSearchFollowupEmail,
  abandoned_reservation: abandonedReservationEmail,
} as const;
