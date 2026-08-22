import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS, canAdmin } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { addFraudCaseNote, applyFraudAction, triageFraudReport, updateFraudCase } from "./actions";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-white/35">{label}</p><p className="mt-2 text-3xl font-black">{value}</p>{detail ? <p className="mt-1 text-xs font-semibold text-white/35">{detail}</p> : null}</div>;
}

export default async function FraudPage({ searchParams }: { searchParams: Params }) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.fraud);
  const params = await searchParams;
  const q = (first(params.q) || "").trim();
  const subject = (first(params.subject) || "").trim();
  const view = first(params.view) || "cases";
  const selectedCaseId = first(params.case) || "";

  let casesQuery = supabaseAdmin.from("fraud_cases").select("*").order("last_activity_at", { ascending: false }).limit(100);
  if (subject) casesQuery = casesQuery.eq("primary_subject_type", subject);
  if (q) casesQuery = casesQuery.or(`primary_subject_id.ilike.%${q.replace(/[%,]/g, " ")}%,title.ilike.%${q.replace(/[%,]/g, " ")}%`);

  const [casesResult, subjectsResult, reportsResult, rulesResult, appealsResult] = await Promise.all([
    casesQuery,
    supabaseAdmin.from("fraud_subjects").select("*").order("risk_score", { ascending: false }).limit(100),
    supabaseAdmin.from("fraud_reports").select("*").in("status", ["new", "triaged"]).order("created_at", { ascending: false }).limit(100),
    supabaseAdmin.from("fraud_rules").select("*").eq("enabled", true),
    supabaseAdmin.from("fraud_appeals").select("*").in("status", ["submitted", "under_review"]).order("created_at", { ascending: false }).limit(50),
  ]);

  for (const result of [casesResult, subjectsResult, reportsResult, rulesResult, appealsResult]) if (result.error) throw result.error;

  const cases = casesResult.data || [];
  const subjects = subjectsResult.data || [];
  const reports = reportsResult.data || [];
  const rules = rulesResult.data || [];
  const appeals = appealsResult.data || [];
  const openCases = cases.filter((item) => item.status !== "closed");
  const highRisk = subjects.filter((item) => ["high", "critical"].includes(item.risk_band));
  const enforced = subjects.filter((item) => item.enforcement_state !== "none");

  const selectedCase = selectedCaseId ? cases.find((item) => item.id === selectedCaseId) || (await supabaseAdmin.from("fraud_cases").select("*").eq("id", selectedCaseId).maybeSingle()).data : null;
  let notes: any[] = [];
  let signals: any[] = [];
  let actions: any[] = [];
  let linkedSubjects: any[] = [];
  if (selectedCase) {
    const details = await Promise.all([
      supabaseAdmin.from("fraud_case_notes").select("*").eq("case_id", selectedCase.id).order("created_at", { ascending: false }),
      supabaseAdmin.from("fraud_signals").select("*").eq("subject_type", selectedCase.primary_subject_type).eq("subject_id", selectedCase.primary_subject_id).order("observed_at", { ascending: false }).limit(100),
      supabaseAdmin.from("fraud_actions").select("*").eq("case_id", selectedCase.id).order("created_at", { ascending: false }),
      supabaseAdmin.from("fraud_case_subjects").select("*").eq("case_id", selectedCase.id),
    ]);
    for (const result of details) if (result.error) throw result.error;
    notes = details[0].data || [];
    signals = details[1].data || [];
    actions = details[2].data || [];
    linkedSubjects = details[3].data || [];
  }

  const canManage = canAdmin(admin.role, "fraudManage");
  const canEnforce = canAdmin(admin.role, "fraudEnforce");

  return <main className="min-h-screen bg-[#050607] p-6 text-white"><div className="mx-auto max-w-[1650px]">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff5570]">Trust & Safety</p><h1 className="mt-2 text-3xl font-black">Fraud & Investigations</h1><p className="mt-1 max-w-4xl text-sm font-semibold text-white/45">Unified fraud command center for users, locations, claims, organizers, events, experiences, reservations, orders, payments, payouts, and reviews.</p></div></div>

    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <Metric label="Open cases" value={openCases.length} detail="Needs investigation or action" />
      <Metric label="High-risk subjects" value={highRisk.length} detail="High or critical risk" />
      <Metric label="Enforced" value={enforced.length} detail="Limited, suspended, or banned" />
      <Metric label="New reports" value={reports.length} detail="Awaiting triage" />
      <Metric label="Appeals" value={appeals.length} detail="Submitted or under review" />
      <Metric label="Active rules" value={rules.length} detail="Detection rules enabled" />
    </section>

    <div className="mt-6 flex flex-wrap gap-2">
      {[['cases','Cases'],['reports','Reports'],['subjects','Risk subjects'],['rules','Rules']].map(([key,label]) => <Link key={key} href={`/admin/dashboard/fraud?view=${key}`} className={`rounded-xl px-4 py-2.5 text-sm font-black ${view === key ? 'bg-[#e1062a]' : 'border border-white/10 bg-white/[.03]'}`}>{label}</Link>)}
    </div>

    {view === "cases" ? <>
      <form className="mt-5 flex flex-wrap gap-2"><input name="q" defaultValue={q} placeholder="Search case title or subject ID" className="min-w-72 flex-1 rounded-xl border border-white/10 bg-black/30 p-3 text-sm font-semibold outline-none"/><select name="subject" defaultValue={subject} className="rounded-xl border border-white/10 bg-black p-3 text-sm font-bold"><option value="">All subjects</option>{['user','location','claim','organizer','event','experience','reservation','order','payment','payout','review'].map((type) => <option key={type}>{type}</option>)}</select><button className="rounded-xl bg-[#e1062a] px-5 py-3 text-sm font-black">Filter</button></form>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,.75fr)]"><section className="space-y-3">{cases.map((item) => <Link key={item.id} href={`/admin/dashboard/fraud?view=cases&case=${item.id}`} className="block rounded-2xl border border-white/10 bg-white/[.035] p-5 hover:border-white/25"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.12em] text-[#ff5570]">Case #{item.case_number} · {item.primary_subject_type}</p><h2 className="mt-1 font-black">{item.title}</h2></div><div className="text-right"><p className="text-2xl font-black">{item.risk_score}</p><p className="text-xs font-bold text-white/40">{item.priority} · {item.status}</p></div></div><p className="mt-2 text-sm text-white/45">{item.summary || 'No case summary yet.'}</p></Link>)}</section>
      <aside>{selectedCase ? <div className="sticky top-6 rounded-2xl border border-white/10 bg-[#0a0b0d] p-5"><p className="text-xs font-black uppercase tracking-[.12em] text-[#ff5570]">Case #{selectedCase.case_number}</p><h2 className="mt-1 text-xl font-black">{selectedCase.title}</h2><p className="mt-2 text-sm text-white/45">Primary subject: {selectedCase.primary_subject_type} / {selectedCase.primary_subject_id}</p>
        <div className="mt-4 grid grid-cols-2 gap-2"><Metric label="Risk" value={selectedCase.risk_score}/><Metric label="Signals" value={signals.length}/></div>
        {canManage ? <form action={updateFraudCase} className="mt-4 space-y-2"><input type="hidden" name="caseId" value={selectedCase.id}/><div className="grid grid-cols-2 gap-2"><select name="status" defaultValue={selectedCase.status} className="rounded-xl border border-white/10 bg-black p-3 text-sm font-bold">{['open','investigating','awaiting_evidence','actioned','appealed','closed'].map((x)=><option key={x}>{x}</option>)}</select><select name="priority" defaultValue={selectedCase.priority} className="rounded-xl border border-white/10 bg-black p-3 text-sm font-bold">{['low','medium','high','urgent'].map((x)=><option key={x}>{x}</option>)}</select></div><textarea name="resolutionNotes" placeholder="Resolution / investigation notes" className="min-h-20 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm"/><button className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-black">Update case</button></form> : null}
        {canEnforce ? <form action={applyFraudAction} className="mt-5 space-y-2 border-t border-white/10 pt-5"><input type="hidden" name="caseId" value={selectedCase.id}/><input type="hidden" name="subjectType" value={selectedCase.primary_subject_type}/><input type="hidden" name="subjectId" value={selectedCase.primary_subject_id}/><p className="text-sm font-black">Enforcement</p><select name="actionType" className="w-full rounded-xl border border-white/10 bg-black p-3 text-sm font-bold">{['monitor','require_verification','hold_publication','remove_content','limit_account','hold_payout','suspend','ban','clear','restore'].map((x)=><option key={x}>{x}</option>)}</select><input name="reason" required placeholder="Reason for action" className="w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm"/><input name="endsAt" type="datetime-local" className="w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm"/><button className="w-full rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black">Apply action</button></form> : null}
        {canManage ? <form action={addFraudCaseNote} className="mt-5 space-y-2 border-t border-white/10 pt-5"><input type="hidden" name="caseId" value={selectedCase.id}/><textarea name="note" required placeholder="Internal investigation note" className="min-h-20 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm"/><button className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-black">Add note</button></form> : null}
        <div className="mt-5 space-y-2 border-t border-white/10 pt-5"><p className="text-sm font-black">Evidence timeline</p>{signals.slice(0,10).map((signal)=><div key={signal.id} className="rounded-xl bg-white/[.035] p-3"><p className="text-xs font-black">{signal.signal_type} · +{signal.score_delta}</p><p className="mt-1 text-xs text-white/40">{signal.category} · severity {signal.severity} · {new Date(signal.observed_at).toLocaleString()}</p></div>)}{actions.slice(0,8).map((action)=><div key={action.id} className="rounded-xl border border-[#ff5570]/20 bg-[#ff5570]/5 p-3"><p className="text-xs font-black">Action: {action.action_type}</p><p className="mt-1 text-xs text-white/40">{action.reason}</p></div>)}{notes.slice(0,8).map((note)=><div key={note.id} className="rounded-xl bg-white/[.035] p-3"><p className="text-xs font-black">Investigation note</p><p className="mt-1 text-xs text-white/55">{note.note}</p></div>)}</div>
        {linkedSubjects.length > 1 ? <div className="mt-5 border-t border-white/10 pt-5"><p className="text-sm font-black">Linked subjects</p><div className="mt-2 flex flex-wrap gap-2">{linkedSubjects.map((link)=><span key={link.id} className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold">{link.subject_type}:{link.subject_id}</span>)}</div></div> : null}
      </div> : <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm font-semibold text-white/40">Select a case to investigate it.</div>}</aside></div>
    </> : null}

    {view === "reports" ? <section className="mt-5 space-y-3">{reports.map((report)=><article key={report.id} className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.12em] text-[#ff5570]">{report.subject_type} · {report.subject_id}</p><h2 className="mt-1 font-black">{report.reason}</h2><p className="mt-2 max-w-3xl text-sm text-white/45">{report.details || 'No additional details.'}</p></div>{canManage ? <form action={triageFraudReport} className="flex gap-2"><input type="hidden" name="reportId" value={report.id}/><button name="reportAction" value="case" className="rounded-xl bg-[#e1062a] px-4 py-2.5 text-xs font-black">Open / link case</button><button name="reportAction" value="dismiss" className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black">Dismiss</button></form> : null}</div></article>)}</section> : null}

    {view === "subjects" ? <section className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{subjects.map((item)=><article key={item.id} className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><p className="text-xs font-black uppercase tracking-[.12em] text-[#ff5570]">{item.subject_type}</p><h2 className="mt-1 break-all font-black">{item.display_label || item.subject_id}</h2><div className="mt-4 flex items-end justify-between"><div><p className="text-4xl font-black">{item.risk_score}</p><p className="text-xs font-bold text-white/40">{item.risk_band} risk</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black">{item.enforcement_state}</span></div></article>)}</section> : null}

    {view === "rules" ? <section className="mt-5 grid gap-3 lg:grid-cols-2">{rules.map((rule)=><article key={rule.id} className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><div className="flex justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.12em] text-[#ff5570]">{rule.category}</p><h2 className="mt-1 font-black">{rule.name}</h2><p className="mt-2 text-sm text-white/45">{rule.description}</p></div><div className="text-right"><p className="text-3xl font-black">+{rule.default_score}</p><p className="text-xs font-bold text-white/40">severity {rule.severity}</p></div></div></article>)}</section> : null}
  </div></main>;
}
