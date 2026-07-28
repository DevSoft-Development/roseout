import type { AdminRole } from "@/lib/users/roles";
export const CRM_READ_ROLES = ["superadmin","admin","editor","reviewer","viewer","partner_ambassador","experience_team"] as const satisfies readonly AdminRole[];
export const CRM_WRITE_ROLES = ["superadmin","admin","editor","partner_ambassador","experience_team"] as const satisfies readonly AdminRole[];

