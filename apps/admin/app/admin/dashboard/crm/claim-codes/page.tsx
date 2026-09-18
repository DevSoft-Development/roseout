import Link from "next/link";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { listClaimCodes } from "@/lib/crm/claim-codes";
import { requireAdminRole } from "@theouthaven/auth/admin-session";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminRole(["superadmin", "admin", "ambassador", "experience_team", "viewer"]);
  const params = await searchParams;
  const result = await listClaimCodes(params);

  return (
    <CrmWorkspaceShell>
      <main className="space-y-5 text-white">
        <header>
          <p className="text-xs font-black uppercase tracking-[.25em] text-rose-300">Claims</p>
          <h1 className="text-3xl font-black">Claim codes</h1>
          <p className="text-white/60">Search, copy, print, expire, and audit claim invitations using the existing code table.</p>
        </header>
        <form className="grid gap-2 md:grid-cols-4">
          <input name="q" defaultValue={params.q} placeholder="Search code or URL" className="rounded-lg bg-black/40 p-2" />
          <select name="status" defaultValue={params.status || ""} className="rounded-lg bg-black p-2">
            <option value="">All statuses</option>
            {["active", "used", "expired", "revoked"].map((status) => <option key={status}>{status}</option>)}
          </select>
          <button className="rounded-lg bg-white font-black text-black">Apply</button>
          <Link href="/admin/dashboard/crm/claims" className="rounded-lg border border-white/15 p-2 text-center">Claims queue</Link>
        </form>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {result.rows.map((code: any) => (
            <article key={code.id} className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
              <b>{code.claim_code}</b>
              <p className="text-sm text-white/55">{code.locations?.name || "Unassigned location"}</p>
              <p className="text-xs text-white/45">Status {code.status || "active"} · expires {code.expires_at ? new Date(code.expires_at).toLocaleDateString() : "—"}</p>
              <div className="mt-3 flex gap-2">
                <button className="rounded bg-white/10 px-3 py-2 text-xs">Copy</button>
                <button className="rounded bg-white/10 px-3 py-2 text-xs">Print</button>
                <button className="rounded bg-white/10 px-3 py-2 text-xs">Expire</button>
              </div>
            </article>
          ))}
        </div>
        {!result.rows.length ? <p className="rounded-2xl border border-dashed border-white/15 p-8 text-white/60">No claim codes match these filters.</p> : null}
      </main>
    </CrmWorkspaceShell>
  );
}
