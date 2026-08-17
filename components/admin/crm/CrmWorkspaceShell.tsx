import Link from "next/link";

export default function CrmWorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/35 p-2">
        <Link
          href="/admin/dashboard/crm"
          className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black text-white/70 transition hover:border-rose-200/30 hover:text-white"
        >
          CRM Home
        </Link>
        <Link
          href="/admin/dashboard/crm/calls"
          className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white transition hover:bg-rose-500"
        >
          3CX Calling
        </Link>
      </div>
      {children}
    </section>
  );
}
