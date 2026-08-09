export const ORGANIZATION_TYPES = [
  "business",
  "restaurant_group",
  "venue",
  "promoter",
  "nonprofit",
  "church",
  "community",
  "museum",
  "creator",
  "individual_organizer",
  "other",
] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ORGANIZATION_MEMBER_ROLES = [
  "owner",
  "admin",
  "manager",
  "member",
  "view_only",
] as const;

export type OrganizationMemberRole = (typeof ORGANIZATION_MEMBER_ROLES)[number];
export type OrganizationMemberStatus = "invited" | "active" | "suspended" | "removed";
export type OrganizationStatus = "active" | "inactive" | "suspended" | "archived";
export type OrganizationVerificationStatus = "unverified" | "pending" | "verified" | "rejected" | "suspended";

export type OrganizationRecord = {
  id: string;
  name: string;
  legal_name?: string | null;
  organization_type: OrganizationType;
  status: OrganizationStatus;
  verification_status: OrganizationVerificationStatus;
  trust_level: number;
  created_by_user_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type OrganizationMemberRecord = {
  id: string;
  organization_id: string;
  user_id?: string | null;
  email?: string | null;
  display_name?: string | null;
  role: OrganizationMemberRole;
  status: OrganizationMemberStatus;
  invited_by_user_id?: string | null;
  invited_at?: string | null;
  accepted_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type OrganizationLocationRecord = {
  id: string;
  organization_id: string;
  location_id: string;
  relationship_type: "owned" | "operated" | "managed" | "venue" | "partner";
  status: "active" | "inactive" | "removed";
  linked_by_user_id?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  metadata?: Record<string, unknown> | null;
};
