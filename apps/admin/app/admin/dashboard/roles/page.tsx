import Link from "next/link";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS, type AdminPermissionKey } from "@/lib/admin-permissions";
import { listAdminStaffSecurity } from "@/lib/admin-system";
import {
  listEffectiveAdminRolePolicies,
  OWNER_LOCKED_PERMISSIONS,
} from "@/lib/admin-role-policy";
import { listAdminRoleAuditEvents } from "@/lib/admin-role-audit";
import AdminRolesConsole from "@/components/admin/AdminRolesConsole";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  await requireAdminRole(["superadmin"]);
  const [policies, staff, auditEvents] = await Promise.all([
    listEffectiveAdminRolePolicies(),
    listAdminStaffSecurity(),
    listAdminRoleAuditEvents(),
  ]);
  const permissionKeys = Object.keys(ADMIN_PAGE_ACCESS) as AdminPermissionKey[];
  const lockedPermissions = [...OWNER_LOCKED_PERMISSIONS];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="System · Access Control"
        title="Roles & permissions"
        subtitle="Manage staff authorization from one policy console. Role changes are audited and apply to protected Admin pages, API routes, and navigation access."
        badge={<AdminStatusBadge tone="blue"><LockKeyhole className="mr-1 h-3.5 w-3.5" />Microsoft 365 enforced</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/security">Security center</AdminActionButton>}
      />
      <AdminSectionCard className="p-4 text-xs font-semibold leading-5 text-white/45">
        <span className="font-black text-white/75">Identity policy:</span> every staff role uses Microsoft 365 / Entra ID. Only the protected Superadmin role retains emergency password access. Permission editing cannot change this authentication requirement.
      </AdminSectionCard>

        <AdminRolesConsole
          initialPolicies={policies}
          staff={staff}
          auditEvents={auditEvents}
          permissionKeys={permissionKeys}
          lockedPermissions={lockedPermissions}
        />
    </AdminPageShell>
  );
}
