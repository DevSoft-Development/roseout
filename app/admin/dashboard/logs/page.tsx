import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Operational Logs | TheOutHaven Admin",
  description: "Search import, sync, SMS, reservation, admin activity, claim, and error logs across TheOutHaven operations.",
};

type SearchParams = Promise<{ tab?: string; q?: string }>;

type DbRow = Record<string, unknown>;

type LogRow = {
  id?: string | number | null;
  title: string;
  subtitle?: string;
  status?: string;
  timestamp?: string | null;
  details?: string;
};

type LogSection = {
  key: string;
  label: string;
  description: string;
  rows: LogRow[];
  error?: string;
};

const tabs = [
  { key: "imports", label: "Imports" },
  { key: "reservations", label: "Reservations" },
  { key: "sms", label: "SMS" },
  { key: "admin", label: "Admin Activity" },
  { key: "syncs", label: "Syncs" },
  { key: "errors", label: "Errors" },
];

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function stringify(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function matchesQuery(row: LogRow, q: string) {
  if (!q) return true;
  return [row.title, row.subtitle, row.status, row.details]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q.toLowerCase());
}

async function getSections(): Promise<LogSection[]> {
  const [imports, reservationActivity, sms, adminActivity, syncJobs, claimRows] = await Promise.all([
    supabase.from("import_logs").select("id, job_name, run_date, created_at, meta, error").order("created_at", { ascending: false }).limit(80),
    supabase.from("reservation_activity_logs").select("id, action, location_id, reservation_id, details, created_at").order("created_at", { ascending: false }).limit(80),
    supabase.from("sms_logs").select("id, message_type, customer_phone, status, error_message, sent_at, created_at").order("created_at", { ascending: false }).limit(80),
    supabase.from("activity_logs").select("id, event_name, event_type, page_path, metadata, created_at").order("created_at", { ascending: false }).limit(80),
    supabase.from("sync_logs").select("id, job_name, status, error, meta, created_at").order("created_at", { ascending: false }).limit(80),
    supabase.from("restaurant_claims").select("id, restaurant_id, owner_email, status, created_at").order("created_at", { ascending: false }).limit(40),
  ]);

  const importRows: LogRow[] = (imports.data || []).map((row: DbRow) => ({
    id: typeof row.id === "string" || typeof row.id === "number" ? row.id : undefined,
    title: String(row.job_name || "Import job"),
    subtitle: `Run date: ${formatDate(row.run_date)}`,
    status: row.error ? "Error" : "Completed",
    timestamp: typeof row.created_at === "string" ? row.created_at : null,
    details: row.error ? String(row.error) : stringify(row.meta),
  }));

  const reservationRows: LogRow[] = (reservationActivity.data || []).map((row: DbRow) => ({
    id: typeof row.id === "string" || typeof row.id === "number" ? row.id : undefined,
    title: String(row.action || "Reservation action"),
    subtitle: [row.location_id && `Location ${row.location_id}`, row.reservation_id && `Reservation ${row.reservation_id}`].filter(Boolean).join(" · "),
    status: "Recorded",
    timestamp: typeof row.created_at === "string" ? row.created_at : null,
    details: stringify(row.details),
  }));

  const smsRows: LogRow[] = (sms.data || []).map((row: DbRow) => ({
    id: typeof row.id === "string" || typeof row.id === "number" ? row.id : undefined,
    title: String(row.message_type || "SMS message"),
    subtitle: String(row.customer_phone || "No phone recorded"),
    status: row.error_message ? "Error" : String(row.status || "Queued"),
    timestamp: typeof row.sent_at === "string" ? row.sent_at : typeof row.created_at === "string" ? row.created_at : null,
    details: row.error_message ? String(row.error_message) : "Provider event recorded.",
  }));

  const adminRows: LogRow[] = [
    ...(adminActivity.data || []).map((row: DbRow) => ({
      id: typeof row.id === "string" || typeof row.id === "number" ? row.id : undefined,
      title: String(row.event_name || row.event_type || "Admin activity"),
      subtitle: String(row.page_path || "Application activity"),
      status: String(row.event_type || "Activity"),
      timestamp: typeof row.created_at === "string" ? row.created_at : null,
      details: stringify(row.metadata),
    })),
    ...(claimRows.data || []).map((row: DbRow) => ({
      id: `claim-${String(row.id || "unknown")}`,
      title: "Claim action",
      subtitle: String(row.owner_email || row.restaurant_id || "Location claim"),
      status: String(row.status || "Pending"),
      timestamp: typeof row.created_at === "string" ? row.created_at : null,
      details: `Claim record for restaurant ${String(row.restaurant_id || "unknown")}`,
    })),
  ];

  const syncRows: LogRow[] = (syncJobs.data || []).map((row: DbRow) => ({
    id: typeof row.id === "string" || typeof row.id === "number" ? row.id : undefined,
    title: String(row.job_name || "Sync job"),
    subtitle: stringify(row.meta).slice(0, 120),
    status: row.error ? "Error" : String(row.status || "Completed"),
    timestamp: typeof row.created_at === "string" ? row.created_at : null,
    details: row.error ? String(row.error) : stringify(row.meta),
  }));

  const errorRows = [...importRows, ...reservationRows, ...smsRows, ...adminRows, ...syncRows]
    .filter((row) => String(row.status || "").toLowerCase().includes("error") || String(row.details || "").toLowerCase().includes("error"))
    .slice(0, 80);

  return [
    { key: "imports", label: "Imports", description: "Google, specialty, and bulk import job history.", rows: importRows, error: imports.error?.message },
    { key: "reservations", label: "Reservations", description: "Reservation status changes, layout moves, seating, no-show, and completion actions.", rows: reservationRows, error: reservationActivity.error?.message },
    { key: "sms", label: "SMS", description: "Reservation, waitlist, support, and claim notification delivery events.", rows: smsRows, error: sms.error?.message },
    { key: "admin", label: "Admin Activity", description: "Staff actions, claim events, tracked activity, and moderation signals.", rows: adminRows, error: adminActivity.error?.message || claimRows.error?.message },
    { key: "syncs", label: "Syncs", description: "Location sync and background reconciliation runs.", rows: syncRows, error: syncJobs.error?.message },
    { key: "errors", label: "Errors", description: "A combined error queue from all available log sources.", rows: errorRows },
  ];
}

export default async function AdminLogsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const params = await searchParams;
  const activeTab = tabs.some((tab) => tab.key === params.tab) ? params.tab! : "imports";
  const q = String(params.q || "").trim();
  const sections = await getSections();
  const active = sections.find((section) => section.key === activeTab) || sections[0];
  const rows = active.rows.filter((row) => matchesQuery(row, q));

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">Admin Logs</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Operational Logs</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">A non-empty operations center for imports, reservations, SMS, admin activity, syncs, errors, and claim-related events.</p>
            </div>
            <Link href="/admin/dashboard/import" className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-center text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">Open Import</Link>
          </div>
        </section>

        <form className="mt-5 flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-3 sm:flex-row">
          <input name="q" defaultValue={q} placeholder="Search log titles, statuses, details..." className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/35 px-5 py-3 text-sm font-bold text-white outline-none placeholder:text-white/30" />
          <input type="hidden" name="tab" value={activeTab} />
          <button className="rounded-full bg-white px-6 py-3 text-sm font-black text-black">Search</button>
        </form>

        <nav className="mt-5 flex gap-2 overflow-x-auto rounded-full border border-white/10 bg-white/[0.04] p-2">
          {tabs.map((tab) => (
            <Link key={tab.key} href={`/admin/dashboard/logs?tab=${tab.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.16em] ${activeTab === tab.key ? "bg-white text-black" : "text-white/50 hover:bg-white/10 hover:text-white"}`}>{tab.label}</Link>
          ))}
        </nav>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {sections.map((section) => (
            <div key={section.key} className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl">
              <p className="text-2xl font-black">{section.rows.length}</p>
              <p className="mt-1 text-sm font-black text-white">{section.label}</p>
              <p className="mt-2 text-xs font-bold leading-5 text-white/45">{section.error ? `Table unavailable: ${section.error}` : section.description}</p>
            </div>
          ))}
        </section>

        <section className="mt-5 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
          <div className="border-b border-black/10 px-5 py-4">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-black/40">{active.label}</p>
            <h2 className="mt-1 text-2xl font-black">{active.description}</h2>
          </div>

          {active.error && <div className="m-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">This log source is not installed yet. The logging foundation is documented in <code>supabase/reservation-operations-foundation.sql</code>; available sources still render so the page is never empty.</div>}

          {rows.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-lg font-black">No matching rows in this tab.</p>
              <p className="mt-2 text-sm font-bold text-black/45">Logging foundation is ready; new import, sync, reservation, SMS, admin, and claim events will populate this view.</p>
            </div>
          ) : (
            <div className="divide-y divide-black/10">
              {rows.slice(0, 50).map((log) => (
                <article key={String(log.id || `${log.title}-${log.timestamp}`)} className="grid gap-3 p-5 lg:grid-cols-[1fr_180px_180px_1.2fr] lg:items-center">
                  <div>
                    <p className="text-lg font-black">{log.title}</p>
                    <p className="mt-1 text-sm font-bold text-black/45">{log.subtitle || "Operational event"}</p>
                  </div>
                  <p className="text-sm font-black text-black/60">{formatDate(log.timestamp)}</p>
                  <p className={`rounded-2xl px-4 py-3 text-sm font-bold ${String(log.status || "").toLowerCase().includes("error") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{log.status || "Recorded"}</p>
                  <p className="line-clamp-3 text-sm font-medium leading-6 text-black/55">{log.details || "No extra details recorded."}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
