export type EmailDepartment =
  | "account"
  | "security"
  | "reservations"
  | "claims"
  | "support"
  | "billing"
  | "plans"
  | "upsell"
  | "admin"
  | "superadmin"
  | "locations"
  | "marketing"
  | "system";

export type RecipientType = "user" | "admin" | "superadmin" | "location_owner" | "support" | "system" | "marketing";

export type EmailCta = { label: string; url: string };
export type EmailMetric = { label: string; value: string | number | null | undefined; detail?: string | null };
export type EmailInfoItem = { label: string; value: string | number | null | undefined };
export type EmailAlertItem = { title: string; detail?: string; severity?: "info" | "warning" | "critical" | "success"; url?: string };

export type EmailTable = { columns: string[]; rows: Array<Array<string | number | null | undefined>> };
export type EmailTimelineItem = { title: string; detail?: string; timestamp?: string | null };

export type EmailSection =
  | { type: "paragraph"; text: string }
  | { type: "infoList"; title?: string; items: EmailInfoItem[] }
  | { type: "statGrid"; title?: string; metrics: EmailMetric[] }
  | { type: "alertList"; title?: string; alerts: EmailAlertItem[] }
  | { type: "table"; title?: string; table: EmailTable }
  | { type: "divider" }
  | { type: "callout"; title?: string; text: string; tone?: "info" | "warning" | "critical" | "success" }
  | { type: "timeline"; title?: string; items: EmailTimelineItem[] }
  | { type: "signature"; text?: string };

export type RenderBrandedEmailInput = {
  department: EmailDepartment;
  subject: string;
  preview: string;
  heading: string;
  eyebrow?: string;
  intro?: string;
  sections?: EmailSection[];
  cta?: EmailCta;
  secondaryCta?: EmailCta;
  footerNote?: string;
  recipientType?: RecipientType;
  marketing?: boolean;
};

export type RenderedEmail = {
  subject: string;
  preview: string;
  html: string;
  text: string;
  department: EmailDepartment;
  recipientType?: RecipientType;
};

export type EmailSenderResolution = {
  fromName: string;
  fromEmail: string;
  from: string;
  replyTo: string;
  label: string;
  signature: string;
};

export function formatEmailValue(value: string | number | null | undefined, fallback = "Not provided") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
}

export function formatMetricValue(value: string | number | null | undefined) {
  return formatEmailValue(value, "Not tracked yet");
}
