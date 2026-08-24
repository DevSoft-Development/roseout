import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type ErrorRow = {
  id: string;
  event_type: string;
  severity: string | null;
  message: string | null;
  page_path: string | null;
  component: string | null;
  occurred_at: string;
};

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function group(rows: ErrorRow[]) {
  const map = new Map<string, ErrorRow & { count: number }>();
  for (const row of rows) {
    const key = `${row.event_type}|${row.page_path || ""}|${row.message || ""}`.toLowerCase();
    const current = map.get(key);
    if (!current) map.set(key, { ...row, count: 1 });
    else {
      current.count += 1;
      if (row.occurred_at > current.occurred_at) Object.assign(current, row, { count: current.count });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.occurred_at.localeCompare(a.occurred_at));
}

export default async function ErrorOperationsPage() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await adminClient()
    .from("platform_telemetry_events")
    .select("id,event_type,severity,message,page_path,component,occurred_at")
    .in("event_type", ["runtime_error", "unhandled_rejection", "user_visible_error", "console_error", "api_error", "integration_error"])
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(5000);

  const rows = (data ?? []) as ErrorRow[];
  const incidents = group(rows);
  const visible = rows.filter((r) => r.event_type === "user_visible_error").length;
  const critical = rows.filter((r) => r.severity === "critical").length;
  const routes = new Set(rows.map((r) => r.page_path).filter(Boolean)).size;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-red-500">Operations</p>
        <h1 className="mt-2 text-3xl font-black text-white">Platform Error Operations</h1>
        <p className="mt-2 max-w-3xl text-sm text-neutral-400">Production application errors from the last 24 hours. Search-quality issues remain in Search Health.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Error events", rows.length],
          ["Grouped incidents", incidents.length],
          ["User-visible", visible],
          ["Routes affected", routes],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-white/10 bg-[#141010] p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">{label}</div>
            <div className="mt-2 text-3xl font-black text-white">{value}</div>
          </div>
        ))}
      </div>

      {critical > 0 && <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm font-bold text-red-200">{critical} critical error event{critical === 1 ? "" : "s"} in the last 24 hours.</div>}
      {error && <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-red-200">Couldn’t load platform error telemetry.</div>}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#141010]">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="font-black text-white">Incident queue</h2>
          <p className="mt-1 text-xs text-neutral-500">Duplicates are grouped by error type, route and message.</p>
        </div>
        {incidents.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400">No captured platform errors in the last 24 hours.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {incidents.slice(0, 100).map((item) => (
              <div key={`${item.event_type}-${item.id}`} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wider">
                    <span className={item.severity === "critical" ? "text-red-400" : "text-amber-300"}>{item.severity || "error"}</span>
                    <span className="text-neutral-500">{item.event_type}</span>
                  </div>
                  <div className="mt-2 break-words text-sm font-bold text-white">{item.message || item.event_type}</div>
                  <div className="mt-2 text-xs text-neutral-500">{item.page_path || "Unknown route"}{item.component ? ` · ${item.component}` : ""} · {new Date(item.occurred_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</div>
                </div>
                <div className="self-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-white">{item.count}×</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
