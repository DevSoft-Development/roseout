import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatDate, formatNumber } from "@/lib/admin/formatters";

export const dynamic = "force-dynamic";

type Params = Record<string, string | undefined>;
type ErrorRow = Record<string, any>;

function severityClasses(severity: string) {
  if (severity === "critical") return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  if (severity === "error") return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  if (severity === "warning") return "border-yellow-300/30 bg-yellow-300/10 text-yellow-100";
  return "border-sky-300/30 bg-sky-300/10 text-sky-100";
}

export default async function PlatformErrorsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.logs);
  const p = await searchParams;
  const since24 = new Date(Date.now() - 86400000).toISOString();

  let query = supabaseAdmin
    .from("platform_error_events")
    .select("id,occurred_at,environment,error_type,severity,message,user_visible,route,url,source,status_code,request_id,user_id,anonymous_id,session_id,fingerprint,stack,metadata")
    .order("occurred_at", { ascending: false })
    .limit(500);

  if (p.severity && p.severity !== "all") query = query.eq("severity", p.severity);
  if (p.visible === "yes") query = query.eq("user_visible", true);
  if (p.visible === "no") query = query.eq("user_visible", false);
  if (p.route) query = query.ilike("route", `%${p.route.slice(0, 200)}%`);
  if (p.type) query = query.ilike("error_type", `%${p.type.slice(0, 100)}%`);
  if (p.q) query = query.ilike("message", `%${p.q.slice(0, 200)}%`);
  if (p.from) query = query.gte("occurred_at", p.from);
  if (p.to) query = query.lte("occurred_at", `${p.to}T23:59:59.999Z`);

  const [{ data, error }, total24, visible24, critical24] = await Promise.all([
    query,
    supabaseAdmin.from("platform_error_events").select("id", { count: "exact", head: true }).gte("occurred_at", since24),
    supabaseAdmin.from("platform_error_events").select("id", { count: "exact", head: true }).gte("occurred_at", since24).eq("user_visible", true),
    supabaseAdmin.from("platform_error_events").select("id", { count: "exact", head: true }).gte("occurred_at", since24).eq("severity", "critical"),
  ]);

  const rows = (data || []) as ErrorRow[];
  const recent = rows.filter((row) => new Date(row.occurred_at).getTime() >= Date.now() - 86400000);
  const uniqueIncidents = new Set(recent.map((row) => row.fingerprint || `${row.error_type}|${row.route}|${row.message}`)).size;
  const affectedRoutes = new Set(recent.map((row) => row.route).filter(Boolean)).size;
  const grouped = new Map<string, { message: string; route: string; type: string; severity: string; count: number; visible: number }>();
  for (const row of recent) {
    const key = row.fingerprint || `${row.error_type}|${row.route}|${row.message}`;
    const item = grouped.get(key) || { message: row.message, route: row.route || "Unknown route", type: row.error_type, severity: row.severity, count: 0, visible: 0 };
    item.count += 1;
    if (row.user_visible) item.visible += 1;
    grouped.set(key, item);
  }
  const topIncidents = [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 8);

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,0.20),transparent_32%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">Operations · Reliability</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Platform Error Operations</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-white/65">Application failures across the browser, Next.js rendering, route handlers, and user-visible error states. Search-quality issues stay in Search Health; true technical search failures can appear here too.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/55"><span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">Daily digest · 6:15 AM Eastern</span><span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">Critical errors · immediate alert</span><span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">Duplicate incidents grouped</span></div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["Errors · 24h", total24.count || 0],
            ["User-visible · 24h", visible24.count || 0],
            ["Critical · 24h", critical24.count || 0],
            ["Unique incidents", uniqueIncidents],
            ["Affected routes", affectedRoutes],
          ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><p className="text-xs text-white/55">{label}</p><p className="mt-1 text-2xl font-black">{formatNumber(Number(value))}</p></div>)}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          <form className="grid gap-3 lg:grid-cols-[1.3fr_repeat(6,minmax(130px,1fr))_auto]">
            <Field label="Message" name="q" value={p.q} placeholder="Search error message" />
            <Field label="Route" name="route" value={p.route} placeholder="/api/..." />
            <Field label="Type" name="type" value={p.type} placeholder="next_route_error" />
            <label className="grid gap-1 text-xs font-black uppercase tracking-[.14em] text-white/50">Severity<select name="severity" defaultValue={p.severity || "all"} className="rounded-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-white"><option value="all">All</option><option value="critical">Critical</option><option value="error">Error</option><option value="warning">Warning</option><option value="info">Info</option></select></label>
            <label className="grid gap-1 text-xs font-black uppercase tracking-[.14em] text-white/50">User-visible<select name="visible" defaultValue={p.visible || "all"} className="rounded-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-white"><option value="all">All</option><option value="yes">Yes</option><option value="no">No</option></select></label>
            <Field label="From" name="from" value={p.from} type="date" />
            <Field label="To" name="to" value={p.to} type="date" />
            <button className="self-end rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white">Filter</button>
          </form>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-[#120d0b] p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-rose-200">Top incidents · 24h</p><div className="mt-3 space-y-2">{topIncidents.length ? topIncidents.map((item, index) => <div key={`${item.type}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black">{item.message}</p><p className="mt-1 text-xs text-white/40">{item.route} · {item.type}</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-black ${severityClasses(item.severity)}`}>{item.count}×</span></div><p className="mt-2 text-xs text-white/45">{item.visible} user-visible occurrence{item.visible === 1 ? "" : "s"}</p></div>) : <p className="text-sm text-emerald-200">No platform errors recorded in the last 24 hours.</p>}</div></div>
          <div className="rounded-3xl border border-white/10 bg-[#120d0b] p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-rose-200">Coverage</p><div className="mt-4 grid gap-3 text-sm text-white/65"><p>• Browser runtime exceptions and unhandled promise rejections</p><p>• Next.js render, route-handler, action, and proxy errors</p><p>• Error messages displayed in semantic alert/error UI states</p><p>• Route, source, request context, fingerprint, and stack where safe</p><p>• Critical errors trigger immediate alert delivery</p></div></div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]">
          {error ? <p className="p-6 text-rose-300">{error.message}</p> : rows.length === 0 ? <p className="p-6 text-white/65">No platform errors match these filters.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1450px] text-left text-sm"><thead className="bg-white/5 text-xs uppercase tracking-[0.16em] text-white/45"><tr>{["Time","Severity","Visible","Type","Route","Message","Source","Status","Details"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-white/10 align-top"><td className="whitespace-nowrap p-3 text-white/70">{formatDate(row.occurred_at)}</td><td className="p-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-black ${severityClasses(row.severity)}`}>{row.severity}</span></td><td className="p-3">{row.user_visible ? <span className="font-black text-rose-200">Yes</span> : <span className="text-white/40">No</span>}</td><td className="p-3 text-xs font-bold text-white/70">{row.error_type}</td><td className="max-w-[260px] p-3 font-mono text-xs text-white/65">{row.route || "—"}</td><td className="max-w-[430px] p-3"><p className="font-semibold leading-5">{row.message}</p><p className="mt-1 text-xs text-white/30">Fingerprint: {String(row.fingerprint || "—").slice(0, 100)}</p></td><td className="max-w-[220px] p-3 text-xs text-white/55">{row.source || "—"}</td><td className="p-3">{row.status_code || "—"}</td><td className="p-3"><details><summary className="cursor-pointer font-bold text-rose-200">Inspect</summary><pre className="mt-2 max-h-80 max-w-[520px] overflow-auto rounded-xl bg-black/40 p-3 text-[11px] leading-4 text-white/55">{JSON.stringify({ request_id: row.request_id, session_id: row.session_id, user_id: row.user_id, stack: row.stack, metadata: row.metadata }, null, 2)}</pre></details></td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </main>
  );
}

function Field({ label, name, value, placeholder, type = "text" }: { label: string; name: string; value?: string; placeholder?: string; type?: string }) {
  return <label className="grid gap-1 text-xs font-black uppercase tracking-[.14em] text-white/50">{label}<input name={name} type={type} defaultValue={value || ""} placeholder={placeholder} className="rounded-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-white" /></label>;
}
