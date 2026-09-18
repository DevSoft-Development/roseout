import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { listCallableCrmLocations } from "@/lib/crm/calls";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import {
  AdminPageHeader,
  AdminSearchInput,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function CrmCallsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const params = await searchParams;
  const q = String(params.q || "").trim();
  const page = Math.max(Number(params.page || 1), 1);
  const pageData = await listCallableCrmLocations({
    userId: admin.user_id,
    role: admin.role,
    query: q,
    page,
    pageSize: 50,
  });

  return (
    <CrmWorkspaceShell>
      <AdminPageHeader
        eyebrow="CRM"
        title="Calls"
        subtitle="Find a location, start a call, and keep the conversation connected to the CRM record."
      />

      <AdminSectionCard className="p-4">
        <form className="flex flex-col gap-3 sm:flex-row">
          <AdminSearchInput name="q" defaultValue={q} placeholder="Search location, phone, city, or owner…" />
          <button type="submit" className="min-h-11 rounded-2xl bg-rose-600 px-5 text-sm font-black text-white hover:bg-rose-500">
            Search
          </button>
        </form>
      </AdminSectionCard>

      <AdminSectionCard className="overflow-hidden p-0">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-xl font-black">Ready to call</h2>
          <p className="mt-1 text-sm text-white/55">
            {pageData.total} location{pageData.total === 1 ? "" : "s"} with a phone number match this view.
          </p>
        </div>

        {pageData.rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.16em] text-white/45">
                <tr>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Market</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageData.rows.map((row) => (
                  <tr key={row.id} className="border-t border-white/10">
                    <td className="px-5 py-4">
                      <Link href={`/admin/dashboard/crm/${row.id}`} className="font-black text-white hover:text-rose-200">
                        {row.location_name || row.name}
                      </Link>
                      <div className="mt-1 text-xs text-white/45">
                        {[row.city, row.state].filter(Boolean).join(", ") || "Location"}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-semibold text-white/75">{row.phone}</td>
                    <td className="px-5 py-4 text-white/60">{row.market || row.region || "—"}</td>
                    <td className="px-5 py-4"><AdminStatusBadge>{row.crm_status}</AdminStatusBadge></td>
                    <td className="px-5 py-4">
                      <Link href={`/admin/dashboard/crm/${row.id}/call`} className="inline-flex rounded-full bg-rose-600 px-4 py-2 text-xs font-black text-white hover:bg-rose-500">
                        Call
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-sm text-white/55">No locations with phone numbers match this search.</div>
        )}
      </AdminSectionCard>
    </CrmWorkspaceShell>
  );
}
