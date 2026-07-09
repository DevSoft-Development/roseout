"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, ExternalLink, RefreshCw, Rocket, ShieldAlert, Wrench } from "lucide-react";
import { areas, roles, statusLabels, STATUS_OPTIONS } from "@/lib/production-finish-line/seeds";

type Row = Record<string, any>;
type Data = { items: Row[]; access: Row[]; qr: Row[]; commands: Row[]; prompts: Row[] };
const empty: Data = { items: [], access: [], qr: [], commands: [], prompts: [] };

const cls: Record<string, string> = {
  passed: "border-emerald-400/30 bg-emerald-500/15 text-emerald-100",
  blocked: "border-red-400/40 bg-red-600/20 text-red-100",
  in_progress: "border-sky-400/30 bg-sky-500/15 text-sky-100",
  testing: "border-blue-400/30 bg-blue-500/15 text-blue-100",
  pr_open: "border-red-300/30 bg-red-500/10 text-red-100",
  needs_codex: "border-amber-400/30 bg-amber-500/15 text-amber-100",
  skipped: "border-white/15 bg-white/10 text-white/60",
  not_started: "border-white/15 bg-white/[0.04] text-white/55",
  not_run: "border-white/15 bg-white/[0.04] text-white/55",
  failed: "border-red-400/40 bg-red-600/20 text-red-100",
  wrong_link: "border-amber-400/30 bg-amber-500/15 text-amber-100",
  false_no_access: "border-red-400/40 bg-red-600/20 text-red-100",
  expected_denied: "border-emerald-400/30 bg-emerald-500/15 text-emerald-100",
  not_tested: "border-white/15 bg-white/[0.04] text-white/55",
};

function Pill({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${cls[value] || cls.not_started}`}>{statusLabels[value] || value}</span>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.6rem] border border-white/10 bg-[#111111]/90 p-4 shadow-2xl shadow-black/30 ${className}`}>{children}</section>;
}

function Field({ row, collection, name, value, onSave, placeholder = "", type = "text" }: any) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  const save = () => String(v) !== String(value ?? "") && onSave(collection, row.id, { [name]: v });
  return <input type={type} value={v} placeholder={placeholder} onChange={(event) => setV(event.target.value)} onBlur={save} className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-red-500/70" />;
}

function Notes(props: any) {
  return <textarea value={props.value ?? ""} placeholder="Notes" onChange={(event) => props.onSave(props.collection, props.row.id, { [props.name || "notes"]: event.target.value })} rows={2} className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-red-500/70" />;
}

function StatusSelect({ row, collection, onSave, field = "status", options = STATUS_OPTIONS }: any) {
  const value = row[field] || (field === "result" ? "not_run" : "not_started");
  const optionSet = field === "result" ? ["not_run", "passed", "failed", "skipped"] : Array.from(new Set(["not_tested", ...options, "wrong_link", "false_no_access", "expected_denied", "failed"]));
  return <select value={value} onChange={(event) => onSave(collection, row.id, { [field]: event.target.value, last_checked: new Date().toISOString() })} className="min-w-32 rounded-xl border border-white/10 bg-[#171717] px-2 py-2 text-xs font-bold text-white outline-none focus:border-red-500/70">{optionSet.map((status: string) => <option key={status} value={status}>{statusLabels[status] || status.replaceAll("_", " ")}</option>)}</select>;
}

async function copy(text: string) {
  await navigator.clipboard?.writeText(text);
}

export default function ProductionCommandCenterClient({ adminName, adminRole }: { adminName: string; adminRole: string }) {
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Week 1");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    const response = await fetch("/api/admin/production-finish-line", { cache: "no-store" });
    const json = await response.json();
    if (json.success) setData(json.data);
    else setNotice(json.error || "Could not load production defaults.");
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async (collection: string, id: string, updates: Row) => {
    setData((current) => ({ ...current, [collection]: current[collection as keyof Data].map((row: Row) => row.id === id ? { ...row, ...updates } : row) }));
    const response = await fetch("/api/admin/production-finish-line", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ collection, id, updates }) });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) setNotice(json?.error || "Update failed. Refresh and try again.");
  };

  const repair = async () => {
    setLoading(true);
    const response = await fetch("/api/admin/production-finish-line", { method: "POST" });
    const json = await response.json();
    if (json.success) {
      setData(json.data);
      setNotice(`Defaults repaired. Items: ${json.repaired?.items ?? 0}.`);
    } else {
      setNotice(json.error || "Could not repair defaults.");
    }
    setLoading(false);
  };

  const gates = data.items.filter((item) => item.item_type === "gate");
  const tasks = data.items.filter((item) => item.item_type === "daily_task");
  const decision = data.items.find((item) => item.item_type === "decision");
  const check = (type: string) => data.items.filter((item) => item.item_type === type);

  const kpi = useMemo(() => {
    const p0Gates = gates.filter((gate) => gate.priority === "P0");
    const passedGates = gates.filter((gate) => gate.status === "passed").length;
    const passedCommands = data.commands.filter((command) => command.result === "passed").length;
    const scoredCount = gates.length + data.commands.length;
    const score = scoredCount ? Math.round(((passedGates + passedCommands) / scoredCount) * 100) : 0;
    const p0Blocked = p0Gates.filter((gate) => ["blocked", "needs_codex", "not_started", "pr_open", "testing", "in_progress"].includes(gate.status)).length;
    const p1 = gates.filter((gate) => gate.priority === "P1" && gate.status !== "passed" && gate.status !== "skipped").length;
    const prod = gates.find((gate) => gate.title === "Production Checks")?.status ?? "not_started";
    const p0Ready = p0Gates.length > 0 && p0Gates.every((gate) => gate.status === "passed" || (gate.status === "skipped" && Boolean(gate.notes)));
    const overall = gates.length === 0 ? "Not Ready" : !p0Ready ? "Not Ready" : prod === "passed" ? "Ready for Production" : "Ready for Pilot";
    return { score, p0Blocked, p1, prod, overall };
  }, [gates, data.commands]);

  const promptPassed = data.prompts.filter((prompt) => prompt.status === "passed").length;
  const blockers = data.prompts.filter((prompt) => prompt.status === "blocked" || prompt.status === "needs_codex").slice(0, 3);
  const missingDefaults = gates.length === 0 || tasks.length === 0;

  return <main className="min-h-screen bg-[linear-gradient(135deg,#050505,#0d0d0f_45%,#160608)] px-4 pb-14 pt-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header className="rounded-[2rem] border border-white/10 bg-[#0b0b0c]/95 p-5 shadow-2xl shadow-black/40">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[.32em] text-red-300">Admin / Launch Ops</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">Production Finish Line Command Center</h1>
            <p className="mt-2 text-sm text-white/65">Track every step to production. Fix issues. Ship with confidence.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={repair} className="rounded-full border border-red-500/35 bg-red-600/20 px-4 py-2 text-sm font-black text-red-50"><Wrench className="mr-2 inline h-4 w-4" />Repair missing defaults</button>
            <button onClick={load} className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-black"><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button>
            <span className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-black">{adminName} · {adminRole}</span>
          </div>
        </div>
        {(notice || missingDefaults) && <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">{notice || "Defaults are missing. Use Repair missing defaults to load launch gates and daily tasks without erasing saved results."}</p>}
      </header>

      <div className="grid gap-3 md:grid-cols-5">{[["Readiness Score", `${kpi.score}%`], ["Overall Status", kpi.overall], ["P0 Blockers", kpi.p0Blocked], ["P1 Items", kpi.p1], ["Production Checks", statusLabels[kpi.prod || "not_started"] || "Not started"]].map(([label, value]) => <Card key={label}><p className="text-xs font-black uppercase text-white/45">{label}</p><p className={`mt-2 text-2xl font-black ${label === "Overall Status" && value === "Not Ready" ? "text-red-200" : ""}`}>{value}</p></Card>)}</div>

      <Card>
        <div className="mb-3 flex items-center gap-2"><Rocket className="text-red-300" /><h2 className="text-xl font-black">Launch Gates</h2></div>
        {gates.length === 0 ? <EmptyState onRepair={repair} message="No launch gates loaded." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{gates.map((gate) => <div key={gate.id} className="rounded-2xl border border-white/10 bg-black/30 p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-black">{gate.title}</p><p className="text-xs text-white/45">{gate.priority} · {gate.owner || "Unassigned"}</p></div><Pill value={gate.status} /></div><div className="mt-3 grid grid-cols-2 gap-2"><StatusSelect row={gate} collection="items" onSave={save} /><Field row={gate} collection="items" name="owner" value={gate.owner} placeholder="Owner" onSave={save} /><Field row={gate} collection="items" name="test_url" value={gate.test_url} placeholder="Test URL" onSave={save} /><Field row={gate} collection="items" name="github_pr_url" value={gate.github_pr_url} placeholder="GitHub PR" onSave={save} /><Field row={gate} collection="items" name="codex_task_url" value={gate.codex_task_url} placeholder="Codex task" onSave={save} /></div><div className="mt-2"><Notes row={gate} collection="items" value={gate.notes} onSave={save} /></div></div>)}</div>}
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <Card>
          <h2 className="text-xl font-black">Daily Task Board</h2>
          <div className="my-3 flex gap-2 overflow-x-auto">{["Week 1", "Week 2", "Week 3", "Week 4", "Final 2 Days"].map((week) => <button key={week} onClick={() => setTab(week)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${tab === week ? "bg-red-600 text-white" : "bg-white/10 text-white/70"}`}>{week}</button>)}</div>
          {tasks.filter((task) => task.week === tab).length === 0 ? <EmptyState onRepair={repair} message="No tasks loaded for this week." /> : <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs uppercase text-white/45"><tr><th>Day</th><th>Task</th><th>Gate</th><th>Status</th><th>PR / Codex</th></tr></thead><tbody>{tasks.filter((task) => task.week === tab).map((task) => <tr key={task.id} className="border-t border-white/10"><td className="py-2">{task.day}</td><td className="font-bold">{task.title}</td><td>{task.gate}</td><td><StatusSelect row={task} collection="items" onSave={save} /></td><td className="grid min-w-64 gap-1 py-1"><Field row={task} collection="items" name="github_pr_url" value={task.github_pr_url} placeholder="GitHub PR" onSave={save} /><Field row={task} collection="items" name="codex_task_url" value={task.codex_task_url} placeholder="Codex task" onSave={save} /></td></tr>)}</tbody></table></div>}
        </Card>

        <Card>
          <h2 className="text-xl font-black">Search Reliability Summary</h2>
          <p className="mt-1 text-sm text-white/55">Manual prompt tracking only. The existing Search Health system remains the source of truth.</p>
          <div className="my-3 flex flex-wrap gap-2"><Link className="rounded-full bg-red-600 px-4 py-2 text-xs font-black" href="/admin/dashboard/search-health">Open Search Health <ExternalLink className="inline h-3 w-3" /></Link><Link className="rounded-full bg-white/10 px-4 py-2 text-xs font-black" href="/create">Open /create</Link><span className="rounded-full bg-emerald-500/15 px-4 py-2 text-xs font-black">{data.prompts.length ? Math.round((promptPassed / data.prompts.length) * 100) : 0}% · {promptPassed}/{data.prompts.length} passed</span></div>
          <div className="space-y-2">{blockers.map((blocker) => <p key={blocker.id} className="rounded-xl bg-red-600/10 p-2 text-xs">{blocker.prompt} — {blocker.issue_type || "Blocker"}</p>)}</div>
          <div className="mt-3 max-h-96 overflow-auto">{data.prompts.map((prompt) => <div key={prompt.id} className="mb-2 rounded-2xl border border-white/10 p-3"><button onClick={() => copy(prompt.prompt)} className="float-right text-white/50"><Clipboard className="h-4 w-4" /></button><p className="pr-8 text-sm font-black">{prompt.prompt}</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><StatusSelect row={prompt} collection="prompts" onSave={save} /><Field row={prompt} collection="prompts" name="issue_type" value={prompt.issue_type} placeholder="Issue type" onSave={save} /><Field row={prompt} collection="prompts" name="actual_result" value={prompt.actual_result} placeholder="Actual result" onSave={save} /><Field row={prompt} collection="prompts" name="github_pr_url" value={prompt.github_pr_url} placeholder="GitHub PR" onSave={save} /></div></div>)}</div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2"><Matrix data={data.access} save={save} /><Checklist title="Reserve Checklist" rows={check("reserve")} save={save} /><Checklist title="Beta Readiness" rows={check("beta")} save={save} /><Checklist title="Security Checklist" rows={check("security")} save={save} /></div>

      <Card>
        <div className="flex items-center gap-2"><ShieldAlert className="text-amber-200" /><h2 className="text-xl font-black">QR Claim Pilot</h2></div><p className="mt-1 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">Do not send more than 25 postcards until all P0 gates pass.</p>
        <div className="mt-3 overflow-x-auto"><table className="min-w-[1200px] text-xs"><thead className="text-left uppercase text-white/45"><tr>{["#", "Location", "Claim URL", "QR", "Printed", "Mailed", "Scanned", "Submitted", "Approved", "Dashboard", "Status", "Notes"].map((heading) => <th key={heading} className="p-2">{heading}</th>)}</tr></thead><tbody>{data.qr.map((qr) => <tr key={qr.id} className="border-t border-white/10"><td>{qr.pilot_number}</td><td className="min-w-52"><Field row={qr} collection="qr" name="location_name" value={qr.location_name} onSave={save} /></td><td>{qr.claim_url}</td>{["qr_verified", "postcard_printed", "mailed", "scanned", "claim_submitted", "claim_approved", "owner_dashboard_works"].map((field) => <td key={field}><input type="checkbox" checked={!!qr[field]} onChange={(event) => save("qr", qr.id, { [field]: event.target.checked })} /></td>)}<td><StatusSelect row={qr} collection="qr" onSave={save} /></td><td className="min-w-52"><Notes row={qr} collection="qr" value={qr.notes} onSave={save} /></td></tr>)}</tbody></table></div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <Card><h2 className="text-xl font-black">Production Command Results</h2><p className="text-sm text-white/55">Commands are copyable only. They are never executed from the browser.</p>{data.commands.map((command) => <div key={command.id} className="mt-2 grid gap-2 rounded-2xl border border-white/10 p-3 md:grid-cols-[1fr_auto_auto]"><code className="text-xs text-red-100">{command.command}</code><button onClick={() => copy(command.command)} className="rounded-full bg-red-600 px-3 py-1 text-xs font-black">Copy</button><StatusSelect row={command} collection="commands" field="result" onSave={save} /><Notes row={command} collection="commands" value={command.notes} onSave={save} /></div>)}</Card>
        <Card><CheckCircle2 className="h-8 w-8 text-emerald-300" /><h2 className="mt-2 text-xl font-black">Go / No-Go</h2><p className={`mt-2 text-3xl font-black ${kpi.overall === "Not Ready" ? "text-red-200" : "text-emerald-200"}`}>{kpi.overall}</p><p className="mt-2 text-sm text-white/55">Rules: any P0 blocked or unfinished means Not Ready; all P0 passed with P1 remaining means Ready for Pilot; all P0 passed and Production Checks passed means Ready for Production.</p>{decision && <div className="mt-3 space-y-2"><Field row={decision} collection="items" name="owner" value={decision.owner} placeholder="Reviewer" onSave={save} /><Notes row={decision} collection="items" value={decision.notes} onSave={save} /></div>}</Card>
      </div>

      {loading && <p className="text-center text-white/50">Loading latest stored data…</p>}
    </div>
  </main>;
}

function EmptyState({ message, onRepair }: { message: string; onRepair: () => void }) {
  return <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100"><p className="font-black">{message}</p><p className="mt-1 text-amber-100/80">Run the safe repair action to insert only missing defaults. Existing notes, links, and statuses will be preserved.</p><button onClick={onRepair} className="mt-3 rounded-full bg-red-600 px-4 py-2 text-xs font-black text-white">Repair missing defaults</button></div>;
}

function Matrix({ data, save }: any) {
  return <Card><h2 className="text-xl font-black">Access Matrix</h2><div className="mt-3 overflow-x-auto"><table className="min-w-[900px] text-xs"><thead><tr><th className="p-2 text-left">Role</th>{areas.map((area) => <th key={area} className="p-2 text-left">{area}</th>)}</tr></thead><tbody>{roles.map((role) => <tr key={role} className="border-t border-white/10"><td className="font-black">{role}</td>{areas.map((area) => { const row = data.find((item: Row) => item.role_name === role && item.area_name === area); return <td key={area} className="p-1 align-top">{row && <><StatusSelect row={row} collection="access" onSave={save} /><Notes row={row} collection="access" value={row.notes} onSave={save} /></>}</td>; })}</tr>)}</tbody></table></div></Card>;
}

function Checklist({ title, rows, save }: any) {
  return <Card><h2 className="text-xl font-black">{title}</h2>{rows.length === 0 ? <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">No checklist rows loaded. Use Repair missing defaults.</p> : <div className="mt-3 space-y-2">{rows.map((row: Row) => <div key={row.id} className="grid gap-2 rounded-2xl border border-white/10 p-3 sm:grid-cols-[1fr_auto]"><p className="font-bold">{row.title}</p><StatusSelect row={row} collection="items" onSave={save} /><div className="sm:col-span-2"><Notes row={row} collection="items" value={row.notes} onSave={save} /></div></div>)}</div>}</Card>;
}
