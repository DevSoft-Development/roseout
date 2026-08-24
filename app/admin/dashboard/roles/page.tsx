import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS, ADMIN_ROLE_LABELS } from "@/lib/admin-permissions";
import { listAdminRoleSummaries, listAdminStaffSecurity } from "@/lib/admin-system";
import { ADMIN_ROLE_OPTIONS } from "@/lib/users/roles";
import AdminRoleManager from "@/components/admin/AdminRoleManager";

export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.roles);
  const [summaries, staff] = await Promise.all([listAdminRoleSummaries(), listAdminStaffSecurity()]);

  return (
    <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">Admin Dashboard / System</p>
          <h1 className="mt-2 text-4xl font-black">Roles</h1>
          <p className="mt-2 max-w-3xl text-sm font-bold text-white/55">Manage staff access using the existing centralized permission matrix. Every role change is validated and written to the admin audit log.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summaries.map((summary) => (
            <article key={summary.role} className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black">{summary.label}</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-white/55">{summary.description}</p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{summary.users} staff</span>
              </div>
              <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-white/35">{summary.permissions.length} permissions</p>
              <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-auto">
                {summary.permissions.map((permission) => (
                  <span key={permission} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-bold text-white/55">{permission}</span>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-xl font-black">Staff role assignments</h2>
            <p className="mt-1 text-sm font-semibold text-white/45">The final superadmin cannot be demoted, and a superadmin cannot demote their own account.</p>
          </div>
          <div className="divide-y divide-white/10">
            {staff.map((member) => (
              <div key={member.user_id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-black">{member.full_name || member.email || member.user_id}</p>
                  <p className="mt-1 text-sm font-semibold text-white/45">{member.email || "No email"} · {ADMIN_ROLE_LABELS[member.role]}</p>
                </div>
                <AdminRoleManager userId={member.user_id} currentRole={member.role} roles={ADMIN_ROLE_OPTIONS} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
