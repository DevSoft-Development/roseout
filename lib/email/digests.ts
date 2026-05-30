import { reservationDailySummaryEmail, reservationWeeklySummaryEmail, superadminDailyDashboardEmail, superadminWeeklyDashboardEmail, locationWeeklyPerformanceEmail, type CommonTemplateInput } from "./templates";
import type { EmailMetric, EmailSection } from "./types";
import { formatMetricValue } from "./types";

function metrics(input: CommonTemplateInput, labels: string[]): EmailMetric[] {
  return labels.map((label) => ({ label, value: (input[label] as string | number | null | undefined) ?? "Not tracked yet" }));
}
function sections(titleList: string[], input: CommonTemplateInput): EmailSection[] {
  const provided = input.metrics || [];
  return titleList.map((title) => ({ type: "statGrid", title, metrics: provided.length ? provided : [{ label: "Status", value: formatMetricValue(undefined) }] }));
}
export function buildSuperadminDailyDashboardEmail(input: CommonTemplateInput = {}) {
  return superadminDailyDashboardEmail({ ...input, sections: input.sections || sections(["Platform Snapshot","Claims Queue","Support Desk","Reservation Health","System Errors","Time-Sensitive Items","Data Quality","Upsell Opportunities","Recommended Actions"], input) });
}
export function buildSuperadminWeeklyDashboardEmail(input: CommonTemplateInput = {}) {
  return superadminWeeklyDashboardEmail({ ...input, sections: input.sections || sections(["Weekly Growth","Reservation Performance","Claims Movement","Support Trends","Revenue / Plan Health","Location Quality","Search Demand","Operational Risks","Next Best Actions"], input) });
}
export function buildReservationDailySummaryEmail(input: CommonTemplateInput = {}) {
  return reservationDailySummaryEmail({ ...input, metrics: input.metrics || metrics(input, ["Total reservations","Completed","Cancelled","Failed","Pending"]), sections: input.sections });
}
export function buildReservationWeeklySummaryEmail(input: CommonTemplateInput = {}) {
  return reservationWeeklySummaryEmail({ ...input, metrics: input.metrics || metrics(input, ["Total reservations","Completed","Cancelled","Failed","Pending","Top locations","Problem locations"]), sections: input.sections });
}
export function buildLocationWeeklyPerformanceEmail(input: CommonTemplateInput = {}) {
  return locationWeeklyPerformanceEmail({ ...input, metrics: input.metrics || metrics(input, ["Views","Saves","Searches","Reservations","Profile status"]) });
}
