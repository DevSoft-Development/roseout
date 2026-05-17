import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Logs",
  description: "Admin logs, import logs, sync logs, SMS logs, reservation logs, and activity history.",
};

type LogRow = {
  id?: string | number | null;
  job_name?: string | null;
  run_date?: string | null;
  created_at?: string | null;
  error?: string | null;
  meta?: Record<string, unknown> | null;
};

const sections = [
  { title: "Import logs", description: "Google import and specialty import job history." },
  { title: "Sync logs", description: "Location sync and background reconciliation runs." },
  { title: "SMS logs", description: "Support, reservation, claim, and waitlist text activity." },
  { title: "Reservation logs", description: "Reservation status, layout, and guest operation changes." },
  { title: "Admin activity", description: "Staff changes, moderation actions, and account activity." },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function AdminLogsPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  const { data: importLogs, error: importLogsError } = await supabase
    .from("import_logs")
    .select("id, job_name, run_date, created_at, meta, error")
    .order("created_at", { ascending: false })
    .limit(50);

  const logs = (importLogs || []) as LogRow[];
  const hasLogs = logs.length > 0;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">
            Admin Logs
          </p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight">Logs</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                Review available operational logs. Import logs are shown when present, and the remaining sections are ready for sync, SMS, reservation, and admin activity data.
              </p>
            </div>
            <Link
              href="/admin/dashboard/import"
              className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-center text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
            >
              Open Import
            </Link>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {sections.map((section) => (
            <div key={section.title} className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl">
              <p className="text-sm font-black text-white">{section.title}</p>
              <p className="mt-2 text-xs font-bold leading-5 text-white/45">{section.description}</p>
            </div>
          ))}
        </section>

        {importLogsError && (
          <div className="mt-5 rounded-3xl border border-amber-400/25 bg-amber-400/10 p-5 text-sm font-bold text-amber-100">
            Import logs table is not available yet: {importLogsError.message}
          </div>
        )}

        <section className="mt-5 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
          <div className="border-b border-black/10 px-5 py-4">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-black/40">Available logs data</p>
            <h2 className="mt-1 text-2xl font-black">Import logs</h2>
          </div>

          {!hasLogs ? (
            <div className="p-8 text-center">
              <p className="text-lg font-black">No logs found yet.</p>
              <p className="mt-2 text-sm font-bold text-black/45">
                Import logs, sync logs, SMS logs, reservation logs, and admin activity will appear here as data becomes available.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/10">
              {logs.map((log) => (
                <article key={String(log.id || `${log.job_name}-${log.created_at}`)} className="grid gap-3 p-5 lg:grid-cols-[1fr_180px_1fr] lg:items-center">
                  <div>
                    <p className="text-lg font-black">{log.job_name || "Import job"}</p>
                    <p className="mt-1 text-sm font-bold text-black/45">Run date: {formatDate(log.run_date)}</p>
                  </div>
                  <p className="text-sm font-black text-black/60">{formatDate(log.created_at)}</p>
                  <p className={`rounded-2xl px-4 py-3 text-sm font-bold ${log.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {log.error || "Completed without recorded errors"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
