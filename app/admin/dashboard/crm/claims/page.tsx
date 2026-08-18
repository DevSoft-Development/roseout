import Link from "next/link";
import CrmContextBanner from "@/components/admin/crm/CrmContextBanner";
import { parseCrmContextSearchParams } from "@/lib/crm/context";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { listClaims } from "@/lib/crm/core-modules";

export const dynamic = "force-dynamic";
const views = ["new", "in_review", "information_needed", "approved", "rejected", "expired", "duplicate", "escalated", "mine", "unassigned"];
const label = (value: string) => value.replaceAll("_", " ");

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.claims);
  const p = await searchParams;
  const r = await listClaims(p);

  return (
    <CrmWorkspaceShell>
      <main className="space-y-5 text-white">
        <CrmContextBanner context={parseCrmContextSearchParams(p)} />
        <header>
          <p className="text-xs font-black uppercase tracking-[.25em] text-rose-300">CRM</p>
          <h1 className="text-3xl font-black">Claims</h1>
          <p className="mt-1 text-white/60">Review ownership requests and move each claim to the next step.</p>
        </header>

        <nav className="flex gap-2 overflow-x-auto pb-1">
          {views.map((v) => <Link key={v} href={`?status=${v}`} className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold capitalize ${p.status === v ? "bg-rose-600" : "bg-white/10 text-white/70"}`}>{label(v)}</Link>)}
        </nav>

        <form className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-4">
          <input name="q" defaultValue={p.q} placeholder="Search business, phone, or address" className="rounded-xl bg-black/30 p-3" />
          <select name="status" defaultValue={p.status || ""} className="rounded-xl bg-black/30 p-3"><option value="">All statuses</option>{views.map((v) => <option key={v} value={v}>{label(v)}</option>)}</select>
          <input name="market" defaultValue={p.market} placeholder="Market or state" className="rounded-xl bg-black/30 p-3" />
          <button className="rounded-xl bg-white font-black text-black">Apply filters</button>
        </form>

        <section className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-white/[0.05] text-xs uppercase text-white/45"><tr>{["Business", "Claimant", "Contact", "Verification", "Status", "Submitted", "Next action"].map((h) => <th className="p-3" key={h}>{h}</th>)}</tr></thead>
            <tbody>{r.rows.map((x: any) => <tr key={x.id} className="border-t border-white/10"><td className="p-3"><Link className="font-bold text-rose-200" href={`/admin/dashboard/crm/claims/${x.id}`}>{x.submittedBusinessName || "Unnamed claim"}</Link></td><td>{x.claimantName || "—"}</td><td><div>{x.claimantEmail || "—"}</div><div className="text-xs text-white/45">{x.claimantPhone || ""}</div></td><td className="capitalize">{String(x.verificationState || "not verified").replaceAll("_", " ")}</td><td className="capitalize">{label(String(x.status || "new"))}</td><td>{x.submittedAt ? new Date(x.submittedAt).toLocaleDateString() : "—"}</td><td><Link className="font-bold text-rose-200" href={`/admin/dashboard/crm/claims/${x.id}`}>Review</Link></td></tr>)}</tbody>
          </table>
          {!r.rows.length ? <p className="p-8 text-center text-white/60">No claims match these filters.</p> : null}
        </section>
      </main>
    </CrmWorkspaceShell>
  );
}
