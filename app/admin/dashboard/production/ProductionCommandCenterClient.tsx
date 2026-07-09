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

const statusHelp = [
  ["Not started", "You have not tested this yet."],
  ["In progress", "You are working on it now."],
  ["Blocked", "Something is broken and must be fixed before launch."],
  ["Needs Codex", "Create a focused Codex/PR fix for this item."],
  ["Testing", "A fix exists; verify it in preview."],
  ["Passed", "You tested it and it works."],
];

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
  return <textarea value={props.value ?? ""} placeholder="Write what happened, what is broken, or the next action" onChange={(event) => props.onSave(props.collection, props.row.id, { [props.name || "notes"]: event.target.value })} rows={2} className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-red-500/70" />;
}

function StatusSelect({ row, collection, onSave, field = "status", options = STATUS_OPTIONS }: any) {
  const value = row[field] || (field === "result" ? "not_run" : "not_started");
  const optionSet = field === "result" ? ["not_run", "passed", "failed", "skipped"] : Array.from(new Set(["not_tested", ...options, "wrong_link", "false_no_access", "expected_denied", "failed"]));
  return <select aria-label="Update status" value={value} onChange={(event) => onSave(collection, row.id, { [field]: event.target.value, last_checked: new Date().toISOString() })} className="min-w-32 rounded-xl border border-white/10 bg-[#171717] px-2 py-2 text-xs font-bold text-white outline-none focus:border-red-500/70">{optionSet.map((status: string) => <option key={status} value={status}>{statusLabels[status] || status.replaceAll("_", " ")}</option>)}</select>;
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
      setNotice(`Defaults repaired. Items added: ${json.repaired?.items ?? 0}. Saved notes and links were preserved.`);
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
  const weekTasks = tasks.filter((task) => task.week === tab);

  return <main className="min-h-screen bg-[linear-gradient(135deg,#050505,#0d0d0f_45%,#160608)] px-4 pb-14 pt-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header className="rounded-[2rem] border border-white/10 bg-[#0b0b0c]/95 p-5 shadow-2xl shadow-black/40">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[.32em] text-red-300">Admin / Launch Ops</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">Production Finish Line Command Center</h1>
            <p className="mt-2 text-sm text-white/65">A launch checklist. Use it to track what is tested, what is broken, and which PR fixes each blocker.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={repair} className="rounded-full border border-red-500/35 bg-red-600/20 px-4 py-2 text-sm font-black text-red-50"><Wrench className="mr-2 inline h-4 w-4" />Repair missing defaults</button>
            <button onClick={load} className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-black"><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button>
            <span className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-black">{adminName} · {adminRole}</span>
          </div>
        </div>
        {(notice || missingDefaults) && <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">{notice || "Defaults are missing. Click Repair missing defaults. It will add missing launch gates/tasks without erasing saved notes or links."}</p>}
      </header>

      <Card className="border-red-500/20 bg-[#140707]/70">
        <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[.25em] text-red-300">Start here</p>
            <h2 className="mt-2 text-2xl font-black">How to use this page</h2>
            <p className="mt-2 text-sm text-white/65">Do not try to understand every table at once. Work from top to bottom and only update the item you are testing today.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StepCard number="1" title="Load defaults" text="Click Repair missing defaults if gates or tasks are missing." />
            <StepCard number="2" title="Pick today's task" text="Use the Daily Task Board. Change one row to In progress." />
            <StepCard number="3" title="Test it" text="Use the link or command. Add what happened in Notes." />
            <StepCard number="4" title="Mark result" text="Passed means verified. Blocked or Needs Codex means create/fix a PR." />
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-5">{[["Readiness Score", `${kpi.score}%`, "Passed gates and commands"], ["Overall Status", kpi.overall, "Launch decision"], ["P0 Blockers", kpi.p0Blocked, "Must be fixed first"], ["P1 Items", kpi.p1, "Can remain for pilot"], ["Production Checks", statusLabels[kpi.prod || "not_started"] || "Not started", "Build/test command gate"]].map(([label, value, hint]) => <Card key={label}><p className="text-xs font-black uppercase text-white/45">{label}</p><p className={`mt-2 text-2xl font-black ${label === "Overall Status" && value === "Not Ready" ? "text-red-200" : ""}`}>{value}</p><p className="mt-1 text-xs text-white/40">{hint}</p></Card>)}</div>

      <Card>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{statusHelp.map(([title, text]) => <div key={title} className="rounded-2xl border border-white/10 bg-black/25 p-3"><p className="text-xs font-black text-white">{title}</p><p className="mt-1 text-xs text-white/50">{text}</p></div>)}</div>
      </Card>

      <Card>
        <SectionIntro title="1. Launch Gates" description="These are the major areas that decide if TheOutHaven is ready. Start with P0 gates. P0 unfinished means Not Ready." />
        {gates.length === 0 ? <EmptyState onRepair={repair} message="No launch gates loaded." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{gates.map((gate) => <div key={gate.id} className="rounded-2xl border border-white/10 bg-black/30 p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-black">{gate.title}</p><p className="text-xs text-white/45">{gate.priority} · {gate.owner || "Unassigned"}</p></div><Pill value={gate.status} /></div><p className="mt-2 text-xs text-white/45">Use this card to track the PR or test that proves this gate is working.</p><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><label className="space-y-1 text-[11px] font-black uppercase text-white/40">Status<StatusSelect row={gate} collection="items" onSave={save} /></label><label className="space-y-1 text-[11px] font-black uppercase text-white/40">Owner<Field row={gate} collection="items" name="owner" value={gate.owner} placeholder="Owner" onSave={save} /></label><label className="space-y-1 text-[11px] font-black uppercase text-white/40">Test URL<Field row={gate} collection="items" name="test_url" value={gate.test_url} placeholder="Paste test URL" onSave={save} /></label><label className="space-y-1 text-[11px] font-black uppercase text-white/40">GitHub PR<Field row={gate} collection="items" name="github_pr_url" value={gate.github_pr_url} placeholder="Paste PR link" onSave={save} /></label><label className="space-y-1 text-[11px] font-black uppercase text-white/40 sm:col-span-2">Codex task<Field row={gate} collection="items" name="codex_task_url" value={gate.codex_task_url} placeholder="Paste Codex task link" onSave={save} /></label></div><div className="mt-2"><Notes row={gate} collection="items" value={gate.notes} onSave={save} /></div></div>)}</div>}
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <Card>
          <SectionIntro title="2. Daily Task Board" description="Use this as your daily checklist. Only move today's task. Paste the PR link when a fix exists." />
          <div className="my-3 flex gap-2 overflow-x-auto">{["Week 1", "Week 2", "Week 3", "Week 4", "Final 2 Days"].map((week) => <button key={week} onClick={() => setTab(week)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${tab === week ? "bg-red-600 text-white" : "bg-white/10 text-white/70"}`}>{week}</button>)}</div>
          {weekTasks.length === 0 ? <EmptyState onRepair={repair} message="No tasks loaded for this week." /> : <div className="space-y-3">{weekTasks.map((task) => <div key={task.id} className="rounded-2xl border border-white/10 bg-black/25 p-3"><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><p className="text-xs font-black uppercase text-red-200">{task.day} · {task.gate}</p><p className="mt-1 text-base font-black">{task.title}</p></div><StatusSelect row={task} collection="items" onSave={save} /></div><div className="mt-3 grid gap-2 md:grid-cols-2"><label className="space-y-1 text-[11px] font-black uppercase text-white/40">GitHub PR<Field row={task} collection="items" name="github_pr_url" value={task.github_pr_url} placeholder="Paste PR link after fix" onSave={save} /></label><label className="space-y-1 text-[11px] font-black uppercase text-white/40">Codex task<Field row={task} collection="items" name="codex_task_url" value={task.codex_task_url} placeholder="Paste Codex task link" onSave={save} /></label></div><div className="mt-2"><Notes row={task} collection="items" value={task.notes} onSave={save} /></div></div>)}</div>}
        </Card>

        <Card>
          <SectionIntro title="3. Search Reliability" description="Run each prompt in /create. Mark Passed if results are useful. Mark Blocked if the result is wrong or empty." />
          <div className="my-3 flex flex-wrap gap-2"><Link className="rounded-full bg-red-600 px-4 py-2 text-xs font-black" href="/admin/dashboard/search-health">Open Search Health <ExternalLink className="inline h-3 w-3" /></Link><Link className="rounded-full bg-white/10 px-4 py-2 text-xs font-black" href="/create">Open /create</Link><span className="rounded-full bg-emerald-500/15 px-4 py-2 text-xs font-black">{data.prompts.length ? Math.round((promptPassed / data.prompts.length) * 100) : 0}% · {promptPassed}/{data.prompts.length} passed</span></div>
          <div className="space-y-2">{blockers.map((blocker) => <p key={blocker.id} className="rounded-xl bg-red-600/10 p-2 text-xs">{blocker.prompt} — {blocker.issue_type || "Blocker"}</p>)}</div>
          <div className="mt-3 max-h-96 overflow-auto">{data.prompts.map((prompt) => <div key={prompt.id} className="mb-2 rounded-2xl border border-white/10 p-3"><button onClick={() => copy(prompt.prompt)} className="float-right text-white/50"><Clipboard className="h-4 w-4" /></button><p className="pr-8 text-sm font-black">{prompt.prompt}</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><StatusSelect row={prompt} collection="prompts" onSave={save} /><Field row={prompt} collection="prompts" name="issue_type" value={prompt.issue_type} placeholder="Issue type" onSave={save} /><Field row={prompt} collection="prompts" name="actual_result" value={prompt.actual_result} placeholder="What happened?" onSave={save} /><Field row={prompt} collection="prompts" name="github_pr_url" value={prompt.github_pr_url} placeholder="PR link" onSave={save} /></div></div>)}</div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2"><Matrix data={data.access} save={save} /><Checklist title="Reserve Checklist" rows={check("reserve")} save={save} help="Use this when testing reservations, waitlist, and walk-ins." /><Checklist title="Beta Readiness" rows={check("beta")} save={save} help="Use this when testing beta signup and weekly task completion." /><Checklist title="Security Checklist" rows={check("security")} save={save} help="Use this before any larger launch or postcard campaign." /></div>

      <Card>
        <div className="flex items-center gap-2"><ShieldAlert className="text-amber-200" /><h2 className="text-xl font-black">QR Claim Pilot</h2></div><p className="mt-1 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">Use this only for the first 25 postcard tests. Do not send more than 25 postcards until all P0 gates pass.</p>
        <div className="mt-3 overflow-x-auto"><table className="min-w-[1200px] text-xs"><thead className="text-left uppercase text-white/45"><tr>{["#", "Location", "Claim URL", "QR", "Printed", "Mailed", "Scanned", "Submitted", "Approved", "Dashboard", "Status", "Notes"].map((heading) => <th key={heading} className="p-2">{heading}</th>)}</tr></thead><tbody>{data.qr.map((qr) => <tr key={qr.id} className="border-t border-white/10"><td>{qr.pilot_number}</td><td className="min-w-52"><Field row={qr} collection="qr" name="location_name" value={qr.location_name} onSave={save} /></td><td>{qr.claim_url}</td>{["qr_verified", "postcard_printed", "mailed", "scanned", "claim_submitted", "claim_approved", "owner_dashboard_works"].map((field) => <td key={field}><input type="checkbox" checked={!!qr[field]} onChange={(event) => save("qr", qr.id, { [field]: event.target.checked })} /></td>)}<td><StatusSelect row={qr} collection="qr" onSave={save} /></td><td className="min-w-52"><Notes row={qr} collection="qr" value={qr.notes} onSave={save} /></td></tr>)}</tbody></table></div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <Card><SectionIntro title="Production Command Results" description="Copy these commands and run them in terminal/Codex. This page only stores the result." />{data.commands.map((command) => <div key={command.id} className="mt-2 grid gap-2 rounded-2xl border border-white/10 p-3 md:grid-cols-[1fr_auto_auto]"><code className="text-xs text-red-100">{command.command}</code><button onClick={() => copy(command.command)} className="rounded-full bg-red-600 px-3 py-1 text-xs font-black">Copy</button><StatusSelect row={command} collection="commands" field="result" onSave={save} /><Notes row={command} collection="commands" value={command.notes} onSave={save} /></div>)}</Card>
        <Card><CheckCircle2 className="h-8 w-8 text-emerald-300" /><h2 className="mt-2 text-xl font-black">Go / No-Go</h2><p className={`mt-2 text-3xl font-black ${kpi.overall === "Not Ready" ? "text-red-200" : "text-emerald-200"}`}>{kpi.overall}</p><p className="mt-2 text-sm text-white/55">Use this as the final decision. Not Ready means do not launch wider. Ready for Pilot means small controlled testing only. Ready for Production means P0 gates and production checks passed.</p>{decision && <div className="mt-3 space-y-2"><Field row={decision} collection="items" name="owner" value={decision.owner} placeholder="Reviewer" onSave={save} /><Notes row={decision} collection="items" value={decision.notes} onSave={save} /></div>}</Card>
      </div>

      {loading && <p className="text-center text-white/50">Loading latest stored data…</p>}
    </div>
  </main>;
}

function StepCard({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/30 p-3"><span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-xs font-black">{number}</span><p className="mt-2 text-sm font-black">{title}</p><p className="mt-1 text-xs text-white/55">{text}</p></div>;
}

function SectionIntro({ title, description }: { title: string; description: string }) {
  return <div className="mb-3"><h2 className="text-xl font-black">{title}</h2><p className="mt-1 text-sm text-white/55">{description}</p></div>;
}

function EmptyState({ message, onRepair }: { message: string; onRepair: () => void }) {
  return <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100"><p className="font-black">{message}</p><p className="mt-1 text-amber-100/80">Run the safe repair action to insert only missing defaults. Existing notes, links, and statuses will be preserved.</p><button onClick={onRepair} className="mt-3 rounded-full bg-red-600 px-4 py-2 text-xs font-black text-white">Repair missing defaults</button></div>;
}

function Matrix({ data, save }: any) {
  return <Card><SectionIntro title="Access Matrix" description="Use this to test each role. Passed means the role saw the correct page. False no access means a valid user was incorrectly blocked." /><div className="mt-3 overflow-x-auto"><table className="min-w-[900px] text-xs"><thead><tr><th className="p-2 text-left">Role</th>{areas.map((area) => <th key={area} className="p-2 text-left">{area}</th>)}</tr></thead><tbody>{roles.map((role) => <tr key={role} className="border-t border-white/10"><td className="font-black">{role}</td>{areas.map((area) => { const row = data.find((item: Row) => item.role_name === role && item.area_name === area); return <td key={area} className="p-1 align-top">{row && <><StatusSelect row={row} collection="access" onSave={save} /><Notes row={row} collection="access" value={row.notes} onSave={save} /></>}</td>; })}</tr>)}</tbody></table></div></Card>;
}

function Checklist({ title, rows, save, help }: any) {
  return <Card><SectionIntro title={title} description={help || "Test each checklist item and write what happened."} />{rows.length === 0 ? <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">No checklist rows loaded. Use Repair missing defaults.</p> : <div className="mt-3 space-y-2">{rows.map((row: Row) => <div key={row.id} className="grid gap-2 rounded-2xl border border-white/10 p-3 sm:grid-cols-[1fr_auto]"><p className="font-bold">{row.title}</p><StatusSelect row={row} collection="items" onSave={save} /><div className="sm:col-span-2"><Notes row={row} collection="items" value={row.notes} onSave={save} /></div></div>)}</div>}</Card>;
}
