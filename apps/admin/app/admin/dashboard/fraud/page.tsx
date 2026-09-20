import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { addFraudCaseNote, applyFraudAction, triageFraudReport, updateFraudCase } from "./actions";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function pretty(value: unknown) { return String(value || "—").replaceAll("_"," ").replace(/\b\w/g,(m)=>m.toUpperCase()); }
function when(value: unknown) { if(!value)return "—"; const d=new Date(String(value)); return Number.isNaN(d.getTime())?"—":d.toLocaleString("en-US"); }

export default async function FraudPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const admin = await requireAdminRole(["superadmin","admin","manager","reviewer"]);
  const p = await searchParams;
  const selectedId = first(p.case) || "";
  const subject = first(p.subject) || "";
  const q = String(first(p.q) || "").trim().replace(/[%_,()]/g," ");
  const db = getAdminDatabaseClient();

  let casesQuery = db.from("fraud_cases").select("id,case_number,title,summary,status,priority,risk_score,primary_subject_type,primary_subject_id,last_activity_at,resolution_notes").order("last_activity_at",{ascending:false}).limit(100);
  if(subject) casesQuery=casesQuery.eq("primary_subject_type",subject);
  if(q) casesQuery=casesQuery.or(`title.ilike.%${q}%,primary_subject_id.ilike.%${q}%`);
  const [{data:cases,error:casesError},{data:reports,error:reportsError}] = await Promise.all([
    casesQuery,
    db.from("fraud_reports").select("id,subject_type,subject_id,reason,details,status,created_at").in("status",["new","triaged"]).order("created_at",{ascending:false}).limit(50)
  ]);
  if(casesError) throw casesError;
  if(reportsError) throw reportsError;

  const selected = selectedId ? (cases || []).find((row:any)=>String(row.id)===selectedId) || (await db.from("fraud_cases").select("*").eq("id",selectedId).maybeSingle()).data : null;
  const [{data:signals},{data:actions},{data:notes}] = selected ? await Promise.all([
    db.from("fraud_signals").select("id,rule_key,signal_type,category,severity,score_delta,evidence,observed_at").eq("subject_type",selected.primary_subject_type).eq("subject_id",selected.primary_subject_id).order("observed_at",{ascending:false}).limit(100),
    db.from("fraud_actions").select("id,action_type,reason,created_at,ends_at,actor_role").eq("subject_type",selected.primary_subject_type).eq("subject_id",selected.primary_subject_id).order("created_at",{ascending:false}).limit(50),
    db.from("fraud_case_notes").select("id,note,created_at,actor_user_id").eq("case_id",selected.id).order("created_at",{ascending:false}).limit(50),
  ]) : [{data:[]},{data:[]},{data:[]}];

  const canManage=["superadmin","admin","manager"].includes(admin.role);
  const canEnforce=["superadmin","admin"].includes(admin.role);

  return <AdminPageShell>
    <AdminPageHeader
      eyebrow="Trust & Safety"
      title="Fraud"
      subtitle="Review fraud cases, human reports, signals, and enforcement history. Enforcement remains restricted to authorized Admin roles."
      badge={<AdminStatusBadge tone={(reports || []).length ? "amber" : "green"}>{(reports || []).length ? `${(reports || []).length} reports awaiting triage` : "Fraud queue clear"}</AdminStatusBadge>}
    />
    <form className="grid gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-4 md:grid-cols-[1fr_220px_auto]">
      <input name="q" defaultValue={q} placeholder="Search case or subject ID" className="rounded-xl bg-black/30 p-3"/>
      <select name="subject" defaultValue={subject} className="rounded-xl bg-black/30 p-3"><option value="">All subjects</option>{["user","location","claim","organizer","event","experience","reservation","order","payment","payout","review","other"].map(x=><option key={x}>{x}</option>)}</select>
      <button className="rounded-xl bg-white px-5 font-black text-black">Filter</button>
    </form>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[.03]">
        <div className="border-b border-white/10 p-4"><h2 className="text-xl font-black">Cases</h2></div>
        <div className="divide-y divide-white/10">{(cases||[]).map((row:any)=><Link key={row.id} href={`?case=${row.id}&subject=${subject}&q=${encodeURIComponent(q)}`} className="block p-4 hover:bg-white/[.04]"><div className="flex justify-between gap-4"><div><p className="text-xs font-black text-rose-200">{row.case_number||row.id}</p><h3 className="mt-1 font-black">{row.title||pretty(row.primary_subject_type)}</h3><p className="mt-1 text-xs text-white/40">{pretty(row.primary_subject_type)} · {row.primary_subject_id}</p></div><div className="text-right"><p className="text-xs font-black">{pretty(row.priority)}</p><p className="mt-1 text-xs text-white/40">{pretty(row.status)} · risk {Number(row.risk_score||0)}</p></div></div></Link>)}</div>
      </section>
      <aside className="space-y-4">
        {selected ? <>
          <section className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><p className="text-xs font-black uppercase tracking-wide text-rose-300">{selected.case_number||selected.id}</p><h2 className="mt-2 text-2xl font-black">{selected.title||pretty(selected.primary_subject_type)}</h2><p className="mt-2 text-sm text-white/55">{selected.summary||"No case summary."}</p><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-black/25 p-3">Status<br/><b>{pretty(selected.status)}</b></div><div className="rounded-xl bg-black/25 p-3">Priority<br/><b>{pretty(selected.priority)}</b></div><div className="rounded-xl bg-black/25 p-3">Risk<br/><b>{Number(selected.risk_score||0)}</b></div><div className="rounded-xl bg-black/25 p-3">Updated<br/><b>{when(selected.last_activity_at)}</b></div></div></section>
          {canManage ? <form action={updateFraudCase} className="rounded-3xl border border-white/10 bg-white/[.04] p-5 space-y-3"><input type="hidden" name="caseId" value={selected.id}/><h3 className="font-black">Case controls</h3><div className="grid grid-cols-2 gap-2"><select name="status" defaultValue={selected.status} className="rounded-xl bg-black/30 p-3">{["open","investigating","awaiting_evidence","actioned","appealed","closed"].map(x=><option key={x}>{x}</option>)}</select><select name="priority" defaultValue={selected.priority} className="rounded-xl bg-black/30 p-3">{["low","medium","high","urgent"].map(x=><option key={x}>{x}</option>)}</select></div><textarea name="resolutionNotes" defaultValue={selected.resolution_notes||""} placeholder="Resolution notes" className="min-h-24 w-full rounded-xl bg-black/30 p-3"/><button className="rounded-xl bg-white px-4 py-2.5 font-black text-black">Save case</button></form> : null}
          {canEnforce ? <form action={applyFraudAction} className="rounded-3xl border border-red-300/15 bg-red-500/[.05] p-5 space-y-3"><input type="hidden" name="caseId" value={selected.id}/><input type="hidden" name="subjectType" value={selected.primary_subject_type}/><input type="hidden" name="subjectId" value={selected.primary_subject_id}/><h3 className="font-black">Enforcement</h3><select name="actionType" className="w-full rounded-xl bg-black/30 p-3">{["monitor","require_verification","hold_publication","remove_content","limit_account","hold_payout","suspend","ban","clear","restore"].map(x=><option key={x}>{x}</option>)}</select><textarea required name="reason" placeholder="Required reason" className="min-h-20 w-full rounded-xl bg-black/30 p-3"/><button className="rounded-xl bg-red-200 px-4 py-2.5 font-black text-black">Apply action</button></form> : null}
          {canManage ? <form action={addFraudCaseNote} className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><input type="hidden" name="caseId" value={selected.id}/><h3 className="font-black">Add note</h3><textarea required name="note" className="mt-3 min-h-20 w-full rounded-xl bg-black/30 p-3"/><button className="mt-3 rounded-xl border border-white/15 px-4 py-2.5 font-black">Save note</button></form> : null}
          <section className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><h3 className="font-black">Recent signals</h3><div className="mt-3 space-y-2">{(signals||[]).map((s:any)=><div key={s.id} className="rounded-xl bg-black/25 p-3 text-sm"><b>{pretty(s.rule_key||s.signal_type)}</b><p className="mt-1 text-xs text-white/45">Severity {s.severity} · +{s.score_delta} · {when(s.observed_at)}</p></div>)}{!(signals||[]).length?<p className="text-sm text-white/45">No signals.</p>:null}</div></section>
          <section className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><h3 className="font-black">Enforcement history</h3><div className="mt-3 space-y-2">{(actions||[]).map((a:any)=><div key={a.id} className="rounded-xl bg-black/25 p-3 text-sm"><b>{pretty(a.action_type)}</b><p className="mt-1 text-white/55">{a.reason}</p><p className="mt-1 text-xs text-white/35">{when(a.created_at)}</p></div>)}{!(actions||[]).length?<p className="text-sm text-white/45">No enforcement actions.</p>:null}</div></section>
          <section className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><h3 className="font-black">Notes</h3><div className="mt-3 space-y-2">{(notes||[]).map((n:any)=><div key={n.id} className="rounded-xl bg-black/25 p-3 text-sm"><p>{n.note}</p><p className="mt-1 text-xs text-white/35">{when(n.created_at)}</p></div>)}{!(notes||[]).length?<p className="text-sm text-white/45">No notes.</p>:null}</div></section>
        </> : <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-white/45">Select a fraud case.</div>}
      </aside>
    </div>
    <section className="rounded-3xl border border-white/10 bg-white/[.03] p-5"><h2 className="text-xl font-black">New human reports</h2><div className="mt-4 grid gap-3">{(reports||[]).map((r:any)=><form key={r.id} action={triageFraudReport} className="rounded-2xl border border-white/10 bg-black/20 p-4"><input type="hidden" name="reportId" value={r.id}/><p className="text-xs font-black uppercase text-rose-200">{pretty(r.subject_type)} · {r.subject_id}</p><p className="mt-1 font-black">{r.reason}</p>{r.details?<p className="mt-1 text-sm text-white/55">{r.details}</p>:null}{canManage?<div className="mt-3 flex gap-2"><button name="reportAction" value="link" className="rounded-lg bg-white px-3 py-2 text-xs font-black text-black">Create/link case</button><button name="reportAction" value="dismiss" className="rounded-lg border border-white/15 px-3 py-2 text-xs font-black">Dismiss</button></div>:null}</form>)}{!(reports||[]).length?<p className="text-sm text-white/45">No new reports.</p>:null}</div></section>
  </AdminPageShell>;
}
