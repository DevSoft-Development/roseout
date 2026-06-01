import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatDate, formatNumber } from "@/lib/admin/formatters";
import { logAdminEvent } from "@/lib/admin/logAdminEvent";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const dynamic = "force-dynamic";
export const metadata = { title: "Platform Logs – Admin" };

const levels = ["all", "info", "warning", "error", "critical"];
const categories = ["all", "auth", "users", "locations", "claims", "crm", "promo_codes", "communication", "reservations", "data_quality", "seo", "search", "analytics", "system"];

function filterHref(key: string, value: string, current: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) if (v && k !== key) params.set(k, v);
  if (value !== "all") params.set(key, value);
  const query = params.toString();
  return query ? `/admin/dashboard/logs?${query}` : "/admin/dashboard/logs";
}

export default async function LogsPage({ searchParams }: { searchParams: Promise<{ level?: string; category?: string; entity_type?: string; actor?: string; q?: string }> }) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.logs);
  const params = await searchParams;
  let query = supabaseAdmin.from("admin_system_logs").select("*").order("created_at", { ascending: false });
  if (params.level && params.level !== "all") query = query.eq("level", params.level);
  if (params.category && params.category !== "all") query = query.eq("category", params.category);
  if (params.entity_type) query = query.eq("entity_type", params.entity_type);
  if (params.actor) query = query.ilike("actor_email", `%${params.actor}%`);
  if (params.q) query = query.or(`message.ilike.%${params.q}%,action.ilike.%${params.q}%,source.ilike.%${params.q}%`);
  const { data, error } = await query.limit(250);
  const rows = data || [];
  const today = rows.filter((r: any) => new Date(r.created_at).toDateString() === new Date().toDateString()).length;

  await logAdminEvent({ category: "system", action: "logs_viewed", message: "Platform logs viewed", actor_user_id: admin.user_id, actor_email: admin.email, entity_type: "platform", entity_id: "logs", metadata: params });

  return <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.18),transparent_30%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">SaaS Operations</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Platform Logs</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">Real admin and system logs by severity, category, actor, entity, and metadata. Location entities link back to the CRM command center.</p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Total", rows.length], ["Errors", rows.filter((r: any) => r.level === "error").length], ["Warnings", rows.filter((r: any) => r.level === "warning").length], ["Critical", rows.filter((r: any) => r.level === "critical").length], ["Today", today]].map(([k, v]) => <div key={String(k)} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><p className="text-xs text-white/60">{k}</p><p className="text-2xl font-black">{formatNumber(Number(v))}</p></div>)}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
        <form className="grid gap-3 lg:grid-cols-[1fr_180px_180px_180px_auto]">
          <input name="q" defaultValue={params.q || ""} placeholder="Search message, action, source..." className="rounded-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35" />
          <input name="actor" defaultValue={params.actor || ""} placeholder="Actor email" className="rounded-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35" />
          <input name="entity_type" defaultValue={params.entity_type || ""} placeholder="Entity type" className="rounded-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35" />
          <select name="level" defaultValue={params.level || "all"} className="rounded-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none">{levels.map((level) => <option key={level}>{level}</option>)}</select>
          <button className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white">Filter</button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
          {categories.map((category) => <Link key={category} href={filterHref("category", category, params)} className={`rounded-full px-3 py-1 ${String(params.category || "all") === category ? "bg-rose-600 text-white" : "border border-white/10 bg-black/20 text-white/60"}`}>{category}</Link>)}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]">
        {error ? <p className="p-6 text-rose-300">{error.message}</p> : rows.length === 0 ? <p className="p-6 text-white/70">No logs yet. Logs will appear after admin actions are performed.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-left text-sm"><thead className="bg-white/5 text-xs uppercase tracking-[0.18em] text-white/50"><tr>{["Timestamp", "Level", "Category", "Action", "Message", "Source", "Actor", "Entity", "Metadata"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map((r: any) => <tr key={r.id} className="border-t border-white/10 align-top hover:bg-white/[0.025]"><td className="p-3 whitespace-nowrap">{formatDate(r.created_at)}</td><td className="p-3"><span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-xs font-black">{r.level}</span></td><td className="p-3">{r.category}</td><td className="p-3">{r.action || "—"}</td><td className="p-3 max-w-[360px]">{r.message}</td><td className="p-3">{r.source || "—"}</td><td className="p-3">{r.actor_email || "System"}</td><td className="p-3">{r.entity_type === "location" && r.entity_id ? <Link href={`/admin/dashboard/crm/${r.entity_id}`} className="font-bold text-rose-200">location:{r.entity_id}</Link> : <span>{[r.entity_type, r.entity_id].filter(Boolean).join(":") || "—"}</span>}</td><td className="p-3"><details><summary className="cursor-pointer text-rose-200">View</summary><pre className="mt-2 max-w-[320px] overflow-auto rounded-xl bg-black/40 p-3 text-xs text-white/60">{JSON.stringify(r.metadata || {}, null, 2)}</pre></details></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  </main>;
}
