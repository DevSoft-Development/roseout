export const USER_ROLES = [
  "user",
  "owner",
  "viewer",
  "editor",
  "reviewer",
  "admin",
  "manager",
  "superadmin",
  "ambassador",
  "experience_team",
  "partner_ambassador",
  "marketing_intern",
  "marketing_specialist",
  "marketing_manager",
  "disabled",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "owner", label: "Owner" },
  { value: "superadmin", label: "Superadmin" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "editor", label: "Editor" },
  { value: "ambassador", label: "Ambassador Team" },
  { value: "experience_team", label: "Experience Team" },
  { value: "partner_ambassador", label: "Partner Ambassador" },
  { value: "marketing_intern", label: "Marketing Intern" },
  { value: "marketing_specialist", label: "Marketing Specialist" },
  { value: "marketing_manager", label: "Marketing Manager" },
  { value: "viewer", label: "Viewer" },
  { value: "reviewer", label: "Reviewer" },
  { value: "disabled", label: "Disabled" },
];
