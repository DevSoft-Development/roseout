import Link from "next/link";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { listSupport } from "@/lib/crm/core-modules";

export const dynamic = "force-dynamic";
const statuses = ["new", "open", "waiting_on_customer", "waiting_on_internal", "escalated", "resolved", "closed", "reopened"];

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const p = await searchParams;
  const r = await listSupport(p);

  return (
    <CrmWorkspaceShell>
      <main className="space-y-5 text-white">
        <header>
          <p className="text-xs font-black uppercase tracking-[.25em] text-rose-300">CRM</p>
          <h1 className="text-3xl font-black">Support</h1>
          <p className="mt-1 text-white/60">Manage customer questions, follow-ups, and cases that need attention.</p>
        </header>

        <nav className="flex gap-2 overflow-x-auto pb-1">
          {statuses.map((s) => <Link key={s} href={`?status=${s}`} className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold ${p.status === s ? "bg-rose-600" : "bg-white/10 text-white/70"}`}>{s.replaceAll("_", " ")}</Link>)}
        </nav>

        <form className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-4">
          <input name="q" defaultValue={p.q} placeholder="Search subject or customer" className="rounded-xl bg-black/30 p-3" />
          <select name="priority" defaultValue={p.priority || ""} className="rounded-xl bg-black/30 p-3"><option value="">All priorities</option>{["low", "normal", "high", "urgent"].map((x) => <option key={x}>{x}</option>)}</select>
          <input name="category" defaultValue={p.category} placeholder="Category" className="rounded-xl bg-black/30 p-3" />
          <button className="rounded-xl bg-white font-black text-black">Apply filters</button>
        </form>

        <section className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-white/[0.05] text-xs uppercase text-white/45"><tr>{["Case", "Subject", "Customer", "Priority", "Status", "Owner", "Updated", "Next action"].map((h) => <th className="p-3" key={h}>{h}</th>)}</tr></thead>
            <tbody>{r.rows.map((t: any) => <tr key={t.id} className="border-t border-white/10"><td className="p-3"><Link className="font-bold text-rose-200" href={`/admin/dashboard/crm/support/${t.id}`}>{t.ticket_number || t.id.slice(0, 8)}</Link></td><td>{t.subject}</td><td>{t.email || t.requester_email || "—"}</td><td className="capitalize">{t.priority}</td><td className="capitalize">{String(t.status || "open").replaceAll("_", " ")}</td><td>{t.assigned_to || "Unassigned"}</td><td>{new Date(t.updated_at || t.created_at).toLocaleDateString()}</td><td><Link className="font-bold text-rose-200" href={`/admin/dashboard/crm/support/${t.id}`}>Open case</Link></td></tr>)}</tbody>
          </table>
          {!r.rows.length ? <p className="p-8 text-center text-white/60">No support cases match these filters.</p> : null}
        </section>
      </main>
    </CrmWorkspaceShell>
  );
}
