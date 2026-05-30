import type { EmailDepartment, EmailSenderResolution } from "./types";

export const THEOUTHAVEN_BRAND = {
  name: "TheOutHaven",
  domainLabel: "TheOutHaven.com",
  emails: {
    default: "concierge@theouthaven.com",
    support: "support@theouthaven.com",
    reservations: "reserve@theouthaven.com",
    admin: "admin@theouthaven.com",
  },
  colors: {
    background: "#090706",
    card: "#141010",
    elevated: "#1c1614",
    border: "rgba(255,255,255,0.12)",
    text: "#fff7f2",
    muted: "#b8aaa3",
    subtle: "#8f817a",
    accent: "#e1062a",
    accentDark: "#b80020",
    softRed: "rgba(225,6,42,0.14)",
  },
} as const;

export const DEPARTMENT_LABELS: Record<EmailDepartment, string> = {
  account: "Account",
  security: "Security",
  reservations: "Reservations",
  claims: "Claims",
  support: "Support",
  billing: "Billing",
  plans: "Plans",
  upsell: "Growth",
  admin: "Admin",
  superadmin: "Superadmin",
  locations: "Locations",
  marketing: "Concierge Notes",
  system: "System Alerts",
};

const defaultEmail = () => process.env.THEOUTHAVEN_FROM_EMAIL || THEOUTHAVEN_BRAND.emails.default;
const supportEmail = () => process.env.THEOUTHAVEN_SUPPORT_EMAIL || THEOUTHAVEN_BRAND.emails.support;
const reservationEmail = () => process.env.THEOUTHAVEN_RESERVATIONS_EMAIL || THEOUTHAVEN_BRAND.emails.reservations;
const adminEmail = () => process.env.THEOUTHAVEN_ADMIN_EMAIL || THEOUTHAVEN_BRAND.emails.admin;

const defaultReplyTo = () => process.env.THEOUTHAVEN_REPLY_TO_EMAIL || THEOUTHAVEN_BRAND.emails.default;
const supportReplyTo = () => process.env.THEOUTHAVEN_SUPPORT_REPLY_TO_EMAIL || THEOUTHAVEN_BRAND.emails.support;
const reservationReplyTo = () => process.env.THEOUTHAVEN_RESERVATIONS_REPLY_TO_EMAIL || THEOUTHAVEN_BRAND.emails.reservations;
const adminReplyTo = () => process.env.THEOUTHAVEN_ADMIN_REPLY_TO_EMAIL || THEOUTHAVEN_BRAND.emails.admin;

export function normalizeEmailDepartment(department?: EmailDepartment | string | null): EmailDepartment {
  const normalized = String(department || "").trim().replace(/[\s_-]+/g, "").toLowerCase();
  const aliases: Record<string, EmailDepartment> = {
    account: "account", accounts: "account", auth: "security", security: "security", password: "security",
    reservation: "reservations", reservations: "reservations", booking: "reservations", reserve: "reservations",
    claim: "claims", claims: "claims", support: "support", help: "support", billing: "billing", payment: "billing",
    plan: "plans", plans: "plans", upsell: "upsell", growth: "upsell", admin: "admin", superadmin: "superadmin",
    system: "system", alert: "system", alerts: "system", location: "locations", locations: "locations", owner: "locations",
    marketing: "marketing", campaign: "marketing", campaigns: "marketing",
  };
  return aliases[normalized] || "account";
}

export function resolveEmailSender(department?: EmailDepartment | string | null): EmailSenderResolution {
  const resolved = normalizeEmailDepartment(department);
  let fromName = "TheOutHaven Concierge";
  let fromEmail = defaultEmail();
  let replyTo = defaultReplyTo();

  if (resolved === "support") {
    fromName = "TheOutHaven Support";
    fromEmail = supportEmail();
    replyTo = supportReplyTo();
  } else if (resolved === "reservations") {
    fromName = "TheOutHaven Reservations";
    fromEmail = reservationEmail();
    replyTo = reservationReplyTo();
  } else if (resolved === "admin" || resolved === "superadmin") {
    fromName = "TheOutHaven Admin";
    fromEmail = adminEmail();
    replyTo = adminReplyTo();
  } else if (resolved === "system") {
    fromName = "TheOutHaven System Alerts";
    fromEmail = adminEmail();
    replyTo = adminReplyTo();
  } else if (resolved === "security") {
    fromName = "TheOutHaven Security";
    fromEmail = adminEmail();
    replyTo = adminReplyTo();
  } else if (resolved === "claims") {
    fromName = "TheOutHaven Claims";
    fromEmail = defaultEmail();
    replyTo = defaultReplyTo();
  }

  return {
    fromName,
    fromEmail,
    from: `${fromName} <${fromEmail}>`,
    replyTo,
    label: DEPARTMENT_LABELS[resolved],
    signature: `${fromName}\n${THEOUTHAVEN_BRAND.domainLabel}`,
  };
}
