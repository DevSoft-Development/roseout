import type { EmailDepartment, EmailSenderResolution } from "./types";

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");

export const THEOUTHAVEN_BRAND = {
  name: "TheOutHaven",
  domainLabel: "TheOutHaven.com",
  logoPath: "/toh_logo.png",
  get siteUrl() {
    return siteUrl();
  },
  get logoUrl() {
    return `${siteUrl()}${this.logoPath}`;
  },
  emails: {
    default: "hello@theouthaven.com",
    business: "business@theouthaven.com",
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


export const EMAIL_SENDER_MAP = {
  customer_account: { fromName: "TheOutHaven.com", fromEmail: "hello@theouthaven.com", replyTo: "support@theouthaven.com" },
  vip: { fromName: "TheOutHaven VIP", fromEmail: "hello@theouthaven.com", replyTo: "support@theouthaven.com" },
  offers: { fromName: "TheOutHaven Offers", fromEmail: "hello@theouthaven.com", replyTo: "support@theouthaven.com" },
  picks: { fromName: "TheOutHaven Picks", fromEmail: "hello@theouthaven.com", replyTo: "support@theouthaven.com" },
  events: { fromName: "TheOutHaven Events", fromEmail: "hello@theouthaven.com", replyTo: "support@theouthaven.com" },
  business_owner: { fromName: "TheOutHaven Business", fromEmail: "business@theouthaven.com", replyTo: "business@theouthaven.com" },
  reservations: { fromName: "TheOutHaven Reservations", fromEmail: "reserve@theouthaven.com", replyTo: "reserve@theouthaven.com" },
  support: { fromName: "TheOutHaven Support", fromEmail: "support@theouthaven.com", replyTo: "support@theouthaven.com" },
  billing: { fromName: "TheOutHaven Billing", fromEmail: "support@theouthaven.com", replyTo: "support@theouthaven.com" },
  security: { fromName: "TheOutHaven Security", fromEmail: "support@theouthaven.com", replyTo: "support@theouthaven.com" },
  admin: { fromName: "TheOutHaven Admin", fromEmail: "admin@theouthaven.com", replyTo: "admin@theouthaven.com" },
} as const;

export type ResolvableEmailSenderKey = keyof typeof EMAIL_SENDER_MAP;

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

export function resolveEmailSender(senderKeyOrDepartment?: EmailDepartment | ResolvableEmailSenderKey | string | null): EmailSenderResolution {
  const raw = String(senderKeyOrDepartment || "customer_account").trim();
  const direct = EMAIL_SENDER_MAP[raw as ResolvableEmailSenderKey];
  const resolvedDepartment = normalizeEmailDepartment(raw);
  const mapped = direct || (resolvedDepartment === "reservations" ? EMAIL_SENDER_MAP.reservations
    : resolvedDepartment === "support" ? EMAIL_SENDER_MAP.support
    : resolvedDepartment === "billing" ? EMAIL_SENDER_MAP.billing
    : resolvedDepartment === "security" ? EMAIL_SENDER_MAP.security
    : resolvedDepartment === "admin" || resolvedDepartment === "superadmin" || resolvedDepartment === "system" ? EMAIL_SENDER_MAP.admin
    : resolvedDepartment === "locations" || resolvedDepartment === "claims" || resolvedDepartment === "upsell" ? EMAIL_SENDER_MAP.business_owner
    : resolvedDepartment === "marketing" ? EMAIL_SENDER_MAP.picks
    : EMAIL_SENDER_MAP.customer_account);
  const fromName = mapped.fromName;
  const fromEmail = mapped.fromEmail;
  const replyTo = mapped.replyTo;
  return { fromName, fromEmail, from: `${fromName} <${fromEmail}>`, replyTo, label: DEPARTMENT_LABELS[resolvedDepartment], signature: `${fromName}\n${THEOUTHAVEN_BRAND.domainLabel}` };
}
