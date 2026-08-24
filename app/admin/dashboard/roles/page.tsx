import Link from "next/link";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS, type AdminPermissionKey } from "@/lib/admin-permissions";
import { listAdminStaffSecurity } from "@/lib/admin-system";
import {
  listEffectiveAdminRolePolicies,
  OWNER_LOCKED_PERMISSIONS,
} from "@/lib/admin-role-policy";
import { listAdminRoleAuditEvents } from "@/lib/admin-role-audit";
import AdminRolesConsole from "@/components/admin/AdminRolesConsole";

export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.roles);
  const [policies, staff, auditEvents] = await Promise.all([
    listEffectiveAdminRolePolicies(),
    listAdminStaffSecurity(),
    listAdminRoleAuditEvents(),
  ]);
  const permissionKeys = Object.keys(ADMIN_PAGE_ACCESS) as AdminPermissionKey[];
  const lockedPermissions = [...OWNER_LOCKED_PERMISSIONS];

  return (
    <main className="px-4 pb-14 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,0.14),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-6 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-rose-200/70">
                <ShieldCheck className="h-4 w-4" /> Access Control
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Roles & permissions</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/50">
                Manage staff authorization from one policy console. Role changes are audited and apply to protected admin pages, API routes, and navigation access.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-xl border border-sky-300/15 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-100">
                <LockKeyhole className="h-3.5 w-3.5" /> Microsoft 365 enforced
              </span>
              <Link href="/admin/dashboard/security" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white/65 transition hover:bg-white/[0.08] hover:text-white">
                Security center
              </Link>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs font-semibold leading-5 text-white/45">
            <span className="font-black text-white/75">Identity policy:</span> every staff role uses Microsoft 365 / Entra ID. Only the protected Superadmin role retains emergency password access. Permission editing cannot change this authentication requirement.
          </div>
        </header>

        <AdminRolesConsole
          initialPolicies={policies}
          staff={staff}
          auditEvents={auditEvents}
          permissionKeys={permissionKeys}
          lockedPermissions={lockedPermissions}
        />
      </div>
    </main>
  );
}
