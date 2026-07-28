export type CommunicationChannel = "email" | "sms" | "internal" | "notification" | "support" | "system";
export type CommunicationType = "transactional" | "marketing" | "sales" | "support" | "reservation" | "claim" | "billing" | "onboarding" | "renewal";
export type ConsentStatus = "granted" | "denied" | "unknown" | "not_required";
export type DeliveryDecision = { allowed: boolean; code: "allowed" | "consent_denied" | "consent_unknown" | "suppressed" | "quiet_hours"; reason: string };
export type TemplateContext = Record<string, string | number | null | undefined>;
