export const ASSIGNMENT_SCOPE_FIELDS = ["market", "city", "borough", "neighborhood", "town"] as const;

export type AssignmentScopeField = (typeof ASSIGNMENT_SCOPE_FIELDS)[number];

export type TeamAssignmentFilters = {
  q?: string;
  market?: string;
  city?: string;
  borough?: string;
  neighborhood?: string;
  town?: string;
  state?: string;
  assigned?: string;
  limit?: number;
};

export const ASSIGNMENT_WORK_TYPES = [
  "follow_up",
  "outreach",
  "claim_review",
  "onboarding",
  "support",
  "billing",
  "reservation",
  "site_visit",
  "data_correction",
  "profile_review",
  "renewal",
  "sales",
  "internal",
  "other",
] as const;

export type AssignmentWorkType = (typeof ASSIGNMENT_WORK_TYPES)[number];

const QUEUE_BY_WORK_TYPE: Record<AssignmentWorkType, string> = {
  follow_up: "general",
  outreach: "outreach",
  claim_review: "claims",
  onboarding: "onboarding",
  support: "support",
  billing: "billing",
  reservation: "reservations",
  site_visit: "partnerships",
  data_correction: "data_quality",
  profile_review: "content",
  renewal: "renewals",
  sales: "sales",
  internal: "general",
  other: "general",
};

export function normalizeAssignmentWorkType(value: unknown): AssignmentWorkType {
  const clean = String(value || "").trim() as AssignmentWorkType;
  return ASSIGNMENT_WORK_TYPES.includes(clean) ? clean : "follow_up";
}

export function queueForAssignmentWorkType(value: unknown) {
  return QUEUE_BY_WORK_TYPE[normalizeAssignmentWorkType(value)];
}

export function cleanAssignmentFilter(value: unknown) {
  const clean = String(value || "").trim();
  return clean && clean !== "all" ? clean : undefined;
}

export function assignmentScopeSummary(filters: TeamAssignmentFilters) {
  const parts = [
    cleanAssignmentFilter(filters.market) && `Market: ${filters.market}`,
    cleanAssignmentFilter(filters.city) && `City/Town: ${filters.city}`,
    cleanAssignmentFilter(filters.borough) && `Borough: ${filters.borough}`,
    cleanAssignmentFilter(filters.neighborhood) && `Neighborhood: ${filters.neighborhood}`,
    cleanAssignmentFilter(filters.state) && `State: ${filters.state}`,
    cleanAssignmentFilter(filters.q) && `Search: ${filters.q}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Selected locations";
}

export function buildAssignmentTaskTitle(workType: unknown, locationName: string) {
  const label = normalizeAssignmentWorkType(workType).replaceAll("_", " ");
  return `${label.replace(/\b\w/g, (letter) => letter.toUpperCase())}: ${locationName}`;
}
