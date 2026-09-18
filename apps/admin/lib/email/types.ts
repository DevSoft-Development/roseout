export type EmailSenderKey =
  | "customer_account"
  | "vip"
  | "offers"
  | "picks"
  | "events"
  | "business_owner"
  | "reservations"
  | "support"
  | "billing"
  | "security"
  | "admin";

export type EmailVariant = "transactional" | "customer" | "business" | "admin" | "reservation" | "support" | "billing" | "security" | "marketing" | "digest";
export type EmailPriority = "low" | "normal" | "high" | "urgent";

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

export type RecipientType = "user" | "admin" | "superadmin" | "location_owner" | "support" | "system" | "marketing" | "customer" | "business";

export type EmailCta = { label: string; url: string };
export type EmailMetric = { label: string; value: string | number | null | undefined; detail?: string | null };
export type EmailInfoItem = { label: string; value: string | number | null | undefined };
export type EmailActionItem = { label: string; detail?: string; url?: string };
export type EmailLocationBranding = { locationName?: string; logoUrl?: string; accentColor?: string; heroImageUrl?: string };
export type EmailTone = "default" | "info" | "warning" | "critical" | "success" | "premium";
export type EmailAlertItem = { title: string; detail?: string; severity?: EmailTone; url?: string };

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
  | { type: "signature"; text?: string }
  | { type: "badgeRow"; badges: Array<{ label: string; tone?: EmailTone }> }
  | { type: "highlightCard"; title: string; text?: string; items?: EmailInfoItem[]; tone?: EmailTone }
  | { type: "keyValueGrid"; title?: string; items: EmailInfoItem[] }
  | { type: "actionList"; title?: string; actions: EmailActionItem[] }
  | { type: "locationCard"; title?: string; name: string; address?: string; logoUrl?: string; imageUrl?: string; cta?: EmailCta }
  | { type: "customerCard"; name?: string; email?: string; phone?: string; notes?: string }
  | { type: "digestSummary"; title?: string; metrics?: EmailMetric[]; alerts?: EmailAlertItem[]; recentActivity?: string[]; recommendedActions?: EmailActionItem[] };

export type RenderBrandedEmailInput = {
  department?: EmailDepartment;
  templateKey?: string;
  senderKey?: EmailSenderKey;
  variant?: EmailVariant;
  priority?: EmailPriority;
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
  primaryCta?: EmailCta;
  sourceType?: string;
  sourceId?: string;
  locationBranding?: EmailLocationBranding;
};

export type RenderedEmail = {
  subject: string;
  preview: string;
  html: string;
  text: string;
  department: EmailDepartment;
  senderKey?: EmailSenderKey;
  variant?: EmailVariant;
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
