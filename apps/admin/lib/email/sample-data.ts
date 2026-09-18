import type { CommonTemplateInput } from "./templates";
export const DEFAULT_EMAIL_SAMPLE_DATA: CommonTemplateInput = {
  firstName: "Alex",
  name: "Alex Morgan",
  email: "alex@example.com",
  phone: "(555) 010-2040",
  locationName: "Sample Social Club",
  address: "123 Haven Ave, New York, NY",
  date: "July 18, 2026",
  time: "7:30 PM",
  partySize: 4,
  confirmationCode: "TOH-48291",
  ctaUrl: "https://theouthaven.com/admin/dashboard",
  metrics: [{ label: "New requests", value: 12, detail: "Last 24 hours" }, { label: "Needs review", value: 3 }],
  alerts: [{ title: "Follow-up recommended", detail: "One guest message is waiting for a response.", severity: "warning" }],
};
export function getSampleDataForTemplate(): CommonTemplateInput { return DEFAULT_EMAIL_SAMPLE_DATA; }
