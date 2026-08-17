import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { listBusinessCRMPage } from "@/lib/admin-crm";
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
  await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const params = await searchParams;
  const q = String(params.q || "").trim();
  const page = Math.max(Number(params.page || 1), 1);
  const pageData = await listBusinessCRMPage({
    page,
    pageSize: 50,
    query: q,
    filter: "all",
    market: "all",
    permittedLocationIds: null,
  });

  const callable = pageData.rows.filter((row) => Boolean(row.phone));

  return (
    <CrmWorkspaceShell>
      <AdminPageHeader
        eyebrow="CRM · 3CX"
        title="3CX Calling"
        subtitle="Search a location and open its CRM call workspace. Calls use the configured 3CX desktop, web, or browser handler and journal back into CRM activity when 3CX reporting is configured."
      />

      <AdminSectionCard className="p-4">
        <form className="flex flex-col gap-3 sm:flex-row">
          <AdminSearchInput
            name="q"
            defaultValue={q}
            placeholder="Search location, phone, city, or owner…"
          />
          <button
            type="submit"
            className="min-h-11 rounded-2xl bg-rose-600 px-5 text-sm font-black text-white hover:bg-rose-500"
          >
            Search
          </button>
        </form>
      </AdminSectionCard>

      <AdminSectionCard className="overflow-hidden p-0">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-xl font-black">Locations ready to call</h2>
          <p className="mt-1 text-sm text-white/55">
            {callable.length} callable location{callable.length === 1 ? "" : "s"} on this page.
          </p>
        </div>

        {callable.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.16em] text-white/45">
                <tr>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Market</th>
                  <th className="px-5 py-3">CRM status</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {callable.map((row) => (
                  <tr key={row.id} className="border-t border-white/10">
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/dashboard/crm/${row.id}`}
                        className="font-black text-white hover:text-rose-200"
                      >
                        {row.location_name || row.name}
                      </Link>
                      <div className="mt-1 text-xs text-white/45">
                        {[row.city, row.state].filter(Boolean).join(", ") || "Location"}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-semibold text-white/75">{row.phone}</td>
                    <td className="px-5 py-4 text-white/60">{row.market || row.region || "—"}</td>
                    <td className="px-5 py-4">
                      <AdminStatusBadge>{row.crm_status}</AdminStatusBadge>
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/dashboard/crm/${row.id}/call`}
                        className="inline-flex rounded-full bg-rose-600 px-4 py-2 text-xs font-black text-white hover:bg-rose-500"
                      >
                        Open 3CX Call
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-sm text-white/55">
            No callable locations match this search. Add a phone number to the CRM record first.
          </div>
        )}
      </AdminSectionCard>
    </CrmWorkspaceShell>
  );
}
