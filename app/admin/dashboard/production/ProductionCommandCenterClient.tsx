"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, ExternalLink, RefreshCw, Rocket, ShieldAlert, Wrench } from "lucide-react";
import { areas, roles, statusLabels, STATUS_OPTIONS } from "@/lib/production-finish-line/seeds";

type Row = Record<string, any>;
type Data = { items: Row[]; access: Row[]; qr: Row[]; commands: Row[]; prompts: Row[] };
type GateRunResult = { gateId: string; title: string; status: string; summary: string; checks: { name: string; status: string; details: string }[]; gate?: Row };
type ReadinessKpi = { score: number; p0Blocked: number; p1: number; prod: string; overall: string; readinessReasons: string[] };
type ScoreBreakdown = {
  passedGates: number;
  totalGates: number;
  openP0Gates: Row[];
  openP1Gates: Row[];
  passedCommands: number;
  totalCommands: number;
  notRunCommands: Row[];
  failedCommands: Row[];
  openReserveRows: Row[];
  openBetaRows: Row[];
  openSecurityRows: Row[];
  openPromptRows: Row[];
  nextActions: string[];
};

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
  ["Testing", "A fix exists or safe checks need human review."],
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

function formatDate(value?: string | null) {
  if (!value) return "Not tested yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not tested yet";
  return date.toLocaleString();
}

function automatedBlock(notes?: string | null) {
  return String(notes ?? "").match(/\[Automated gate test[^]*?(?=\n\n(?!- )|$)/)?.[0]?.trim() ?? "";
}

function automatedSummary(notes?: string | null) {
  const match = automatedBlock(notes).match(/Summary: ([^\n]+)/);
  return match?.[1] ?? "No automated test has run yet.";
}

function plainStatusMessage(status: string) {
  if (status === "passed") return "This gate passed the safe checks. Continue with the next P0 gate.";
  if (status === "testing") return "Some checks passed, but this still needs human review.";
  if (status === "blocked") return "This gate failed a required safe check. Do not launch wider until fixed.";
  if (status === "needs_codex") return "A code fix is needed. Create a focused PR and retest this gate.";
  return "Run the safe test or update the status after manual review.";
}

function statusName(value?: string | null) {
  const key = value || "not_started";
  return statusLabels[key] || key.replaceAll("_", " ");
}

function gateIsPassedOrSkippedWithNotes(gate: Row) {
  return gate.status === "passed" || (gate.status === "skipped" && Boolean(String(gate.notes ?? "").trim()));
}

function isOpenRow(row: Row, field = "status") {
  const status = row[field] || (field === "result" ? "not_run" : "not_started");
  return !["passed", "skipped", "expected_denied"].includes(status);
}

function formatGateCopyText(gate: Row) {
  const block = automatedBlock(gate.notes);
  const parts = [
    `Gate: ${gate.title}`,
    `Priority: ${gate.priority || "Unassigned"}`,
    `Status: ${statusName(gate.status)}`,
    `Owner: ${gate.owner || "Unassigned"}`,
    `Last checked: ${formatDate(gate.last_checked)}`,
    gate.github_pr_url ? `GitHub PR: ${gate.github_pr_url}` : "GitHub PR: Not linked",
    gate.codex_task_url ? `Codex task: ${gate.codex_task_url}` : "Codex task: Not linked",
    "",
    `Why this status: ${plainStatusMessage(gate.status)}`,
    "",
    block || `Last test result: ${automatedSummary(gate.notes)}`,
  ];
  return parts.join("\n");
}

function formatAllGateCopyText(gates: Row[], kpi: ReadinessKpi) {
  const p0 = gates.filter((gate) => gate.priority === "P0");
  const blocked = gates.filter((gate) => ["blocked", "needs_codex"].includes(gate.status));
  const testing = gates.filter((gate) => gate.status === "testing");
  const latestChecked = gates.map((gate) => gate.last_checked).filter(Boolean).sort().at(-1);

  return [
    "Production Gate Test Results",
    `Overall Status: ${kpi.overall}`,
    `Decision Reason: ${kpi.readinessReasons[0] ?? "No readiness reason available."}`,
    `Readiness Score: ${kpi.score}%`,
    `P0 Blockers: ${kpi.p0Blocked}`,
    `P1 Items: ${kpi.p1}`,
    `Last checked: ${formatDate(latestChecked)}`,
    "",
    "Readiness Rules:",
    "- Ready for Production requires all P0 gates passed, Production Checks passed, score at least 90%, no blocked gates, and no open P1 items.",
    "- Ready for Pilot requires all P0 gates passed, no blocked P0 gates, and score at least 70%.",
    "- Not Ready applies when a P0 gate is unfinished/blocked or the score is below 70%.",
    "",
    "P0 Gates:",
    ...(p0.length ? p0.map((gate) => `- ${gate.title}: ${statusName(gate.status)} — ${automatedSummary(gate.notes)}`) : ["- No P0 gates loaded"]),
    "",
    "Blocked / Needs Codex:",
    ...(blocked.length ? blocked.map((gate) => `- ${gate.title}: ${statusName(gate.status)} — ${automatedSummary(gate.notes)}`) : ["- None"]),
    "",
    "Needs Review:",
    ...(testing.length ? testing.map((gate) => `- ${gate.title}: Testing — ${automatedSummary(gate.notes)}`) : ["- None"]),
  ].join("\n");
}

function buildNextActions(breakdown: Omit<ScoreBreakdown, "nextActions">) {
  const actions: string[] = [];
  if (breakdown.openP0Gates.length) actions.push(`Finish P0 gate: ${breakdown.openP0Gates[0].title}`);
  if (breakdown.failedCommands.length) actions.push(`Fix failed command: ${breakdown.failedCommands[0].command}`);
  if (breakdown.notRunCommands.length) actions.push(`Run production command: ${breakdown.notRunCommands[0].command}`);
  if (breakdown.openP1Gates.length) actions.push(`Clear P1 gate: ${breakdown.openP1Gates[0].title}`);
  if (breakdown.openSecurityRows.length) actions.push(`Review security item: ${breakdown.openSecurityRows[0].title}`);
  if (breakdown.openReserveRows.length) actions.push(`Test Reserve item: ${breakdown.openReserveRows[0].title}`);
  if (breakdown.openBetaRows.length) actions.push(`Test Beta item: ${breakdown.openBetaRows[0].title}`);
  if (breakdown.openPromptRows.length) actions.push(`Run search prompt: ${breakdown.openPromptRows[0].prompt}`);
  return actions.slice(0, 5);
}

export default function ProductionCommandCenterClient({ adminName, adminRole }: { adminName: string; adminRole: string }) {
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Week 1");
  const [notice, setNotice] = useState("");
  const [runningGate, setRunningGate] = useState("");
  const [runningAllP0, setRunningAllP0] = useState(false);

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

  const applyGateResults = (results: GateRunResult[]) => {
    setData((current) => ({
      ...current,
      items: current.items.map((item) => {
        const result = results.find((entry) => entry.gateId === item.id);
        return result?.gate ? result.gate : item;
      }),
    }));
  };

  const runGate = async (gateId: string) => {
    setRunningGate(gateId);
    setNotice("");
    const response = await fetch("/api/admin/production-finish-line/run-gate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gateId, mode: "single" }) });
    const json = await response.json().catch(() => null);
    if (response.ok && json?.success) {
      applyGateResults(json.results ?? []);
      setNotice(json.results?.[0]?.summary || "Gate test completed.");
    } else {
      setNotice(json?.error || "Gate test failed. Refresh and try again.");
    }
    setRunningGate("");
  };

  const runAllP0 = async () => {
    setRunningAllP0(true);
    setNotice("");
    const response = await fetch("/api/admin/production-finish-line/run-gate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "all_p0" }) });
    const json = await response.json().catch(() => null);
    if (response.ok && json?.success) {
      const results: GateRunResult[] = json.results ?? [];
      applyGateResults(results);
      const passed = results.filter((result) => result.status === "passed").length;
      const testing = results.filter((result) => result.status === "testing").length;
      const blocked = results.filter((result) => result.status === "blocked" || result.status === "needs_codex").length;
      setNotice(`P0 tests completed. ${passed} passed, ${testing} need review, ${blocked} blocked.`);
    } else {
      setNotice(json?.error || "P0 gate tests failed. Refresh and try again.");
    }
    setRunningAllP0(false);
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

  const kpi = useMemo<ReadinessKpi>(() => {
    const p0Gates = gates.filter((gate) => gate.priority === "P0");
    const p1Gates = gates.filter((gate) => gate.priority === "P1");
    const passedGates = gates.filter((gate) => gate.status === "passed").length;
    const passedCommands = data.commands.filter((command) => command.result === "passed").length;
    const scoredCount = gates.length + data.commands.length;
    const score = scoredCount ? Math.round(((passedGates + passedCommands) / scoredCount) * 100) : 0;
    const unfinishedP0 = p0Gates.filter((gate) => !gateIsPassedOrSkippedWithNotes(gate));
    const blockedP0 = p0Gates.filter((gate) => ["blocked", "needs_codex"].includes(gate.status));
    const blockedAny = gates.filter((gate) => ["blocked", "needs_codex"].includes(gate.status));
    const p1Open = p1Gates.filter((gate) => !gateIsPassedOrSkippedWithNotes(gate));
    const prod = gates.find((gate) => gate.title === "Production Checks")?.status ?? "not_started";
    const productionChecksPassed = prod === "passed";
    const p0Ready = p0Gates.length > 0 && unfinishedP0.length === 0;
    const notReadyReasons = [
      ...(p0Gates.length === 0 ? ["No P0 launch gates are loaded."] : []),
      ...(unfinishedP0.length ? [`${unfinishedP0.length} P0 gate${unfinishedP0.length === 1 ? " is" : "s are"} not passed or intentionally skipped with notes.`] : []),
      ...(blockedP0.length ? [`${blockedP0.length} P0 gate${blockedP0.length === 1 ? " is" : "s are"} blocked or needs Codex.`] : []),
      ...(score < 70 ? [`Readiness score is ${score}%, below the 70% pilot threshold.`] : []),
    ];
    const productionBlockers = [
      ...(!p0Ready ? ["All P0 gates must pass before production readiness."] : []),
      ...(!productionChecksPassed ? ["Production Checks must be passed before production readiness."] : []),
      ...(blockedAny.length ? [`${blockedAny.length} gate${blockedAny.length === 1 ? " is" : "s are"} blocked or needs Codex.`] : []),
      ...(score < 90 ? [`Readiness score is ${score}%, below the 90% production threshold.`] : []),
      ...(p1Open.length ? [`${p1Open.length} P1 item${p1Open.length === 1 ? " remains" : "s remain"} open. Pass them or intentionally skip with notes before production.`] : []),
    ];
    const overall = notReadyReasons.length ? "Not Ready" : productionBlockers.length ? "Ready for Pilot" : "Ready for Production";
    const readinessReasons = overall === "Ready for Production" ? ["All production thresholds are met: P0 gates, Production Checks, score, blockers, and P1 items are clear."] : overall === "Ready for Pilot" ? productionBlockers : notReadyReasons;
    return { score, p0Blocked: unfinishedP0.length, p1: p1Open.length, prod, overall, readinessReasons };
  }, [gates, data.commands]);

  const scoreBreakdown = useMemo<ScoreBreakdown>(() => {
    const base = {
      passedGates: gates.filter((gate) => gate.status === "passed").length,
      totalGates: gates.length,
      openP0Gates: gates.filter((gate) => gate.priority === "P0" && !gateIsPassedOrSkippedWithNotes(gate)),
      openP1Gates: gates.filter((gate) => gate.priority === "P1" && !gateIsPassedOrSkippedWithNotes(gate)),
      passedCommands: data.commands.filter((command) => command.result === "passed").length,
      totalCommands: data.commands.length,
      notRunCommands: data.commands.filter((command) => ["not_run", "not_started", ""].includes(command.result || "not_run")),
      failedCommands: data.commands.filter((command) => ["failed", "blocked", "needs_codex"].includes(command.result || command.status)),
      openReserveRows: check("reserve").filter((row) => isOpenRow(row)).slice(0, 5),
      openBetaRows: check("beta").filter((row) => isOpenRow(row)).slice(0, 5),
      openSecurityRows: check("security").filter((row) => isOpenRow(row)).slice(0, 5),
      openPromptRows: data.prompts.filter((row) => isOpenRow(row)).slice(0, 5),
    };
    return { ...base, nextActions: buildNextActions(base) };
  }, [gates, data.commands, data.items, data.prompts]);

  const copyAllResults = async () => {
    await copy(formatAllGateCopyText(gates, kpi));
    setNotice("Copied all production gate test results.");
  };
  const copyGateResult = async (gate: Row) => {
    await copy(formatGateCopyText(gate));
    setNotice(`Copied ${gate.title} test result.`);
  };

  const promptPassed = data.prompts.filter((prompt) => prompt.status === "passed").length;
  const blockers = data.prompts.filter((prompt) => prompt.status === "blocked" || prompt.status === "needs_codex").slice(0, 3);
  const missingDefaults = gates.length === 0 || tasks.length === 0;
  const weekTasks = tasks.filter((task) => task.week === tab);

  return <main className="min-h-screen bg-[linear-gradient(135deg,#050505,#0d0d0f_45%,#160608)] px-4 pb-14 pt-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header className="rounded-[2rem] border border-white/10 bg-[#0b0b0c]/95 p-5 shadow-2xl shadow-black/40">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div><p className="text-xs font-black uppercase tracking-[.32em] text-red-300">Admin / Launch Ops</p><h1 className="mt-2 text-3xl font-black sm:text-5xl">Production Finish Line Command Center</h1><p className="mt-2 text-sm text-white/65">A launch checklist with safe gate tests. Use it to track what is tested, what is broken, and which PR fixes each blocker.</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={runAllP0} disabled={runningAllP0 || loading} className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-4 py-2 text-sm font-black text-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"><Rocket className="mr-2 inline h-4 w-4" />{runningAllP0 ? "Running P0 tests..." : "Run All P0 Tests"}</button><button onClick={copyAllResults} disabled={!gates.length} className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"><Clipboard className="mr-2 inline h-4 w-4" />Copy All Test Results</button><button onClick={repair} className="rounded-full border border-red-500/35 bg-red-600/20 px-4 py-2 text-sm font-black text-red-50"><Wrench className="mr-2 inline h-4 w-4" />Repair missing defaults</button><button onClick={load} className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-black"><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button><span className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-black">{adminName} · {adminRole}</span></div>
        </div>
        {(notice || missingDefaults) && <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">{notice || "Defaults are missing. Click Repair missing defaults. It will add missing launch gates/tasks without erasing saved notes or links."}</p>}
      </header>

      <Card className="border-red-500/20 bg-[#140707]/70"><div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]"><div><p className="text-xs font-black uppercase tracking-[.25em] text-red-300">Start here</p><h2 className="mt-2 text-2xl font-black">How to use this page</h2><p className="mt-2 text-sm text-white/65">Start with Run All P0 Tests, then use the score breakdown to see what is keeping the app below pilot or production readiness.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><StepCard number="1" title="Run P0 tests" text="Click Run All P0 Tests to check launch-critical gates." /><StepCard number="2" title="Read score breakdown" text="See commands, P1 gates, and checklist rows still lowering the score." /><StepCard number="3" title="Copy results" text="Copy all results or one failed gate for a focused Codex fix." /><StepCard number="4" title="Retest after fixes" text="Click Run Test on the gate after a PR deploys." /></div></div></Card>

      <div className="grid gap-3 md:grid-cols-5">{[["Readiness Score", `${kpi.score}%`, "Passed gates and commands"], ["Overall Status", kpi.overall, kpi.readinessReasons[0] || "Launch decision"], ["P0 Blockers", kpi.p0Blocked, "Must be fixed first"], ["P1 Items", kpi.p1, "Must be clear for production"], ["Production Checks", statusLabels[kpi.prod || "not_started"] || "Not started", "Build/test command gate"]].map(([label, value, hint]) => <Card key={label}><p className="text-xs font-black uppercase text-white/45">{label}</p><p className={`mt-2 text-2xl font-black ${label === "Overall Status" && value === "Not Ready" ? "text-red-200" : ""}`}>{value}</p><p className="mt-1 text-xs text-white/40">{hint}</p></Card>)}</div>

      <ScoreBreakdownCard breakdown={scoreBreakdown} score={kpi.score} />

      <Card><SectionIntro title="Readiness decision rules" description="Production readiness now requires a high score and clean P1 items. Passing P0 gates alone can only qualify the app for pilot readiness." /><div className="grid gap-3 md:grid-cols-3"><div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-50"><p className="font-black">Ready for Production</p><p className="mt-1 opacity-80">All P0 gates passed, Production Checks passed, score at least 90%, no blocked gates, and no open P1 items.</p></div><div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-3 text-xs text-blue-50"><p className="font-black">Ready for Pilot</p><p className="mt-1 opacity-80">All P0 gates passed, no blocked P0 gates, and score at least 70%, but production thresholds are not fully met.</p></div><div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-50"><p className="font-black">Not Ready</p><p className="mt-1 opacity-80">Any P0 gate is unfinished/blocked or the readiness score is below 70%.</p></div></div></Card>

      <Card><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{statusHelp.map(([title, text]) => <div key={title} className="rounded-2xl border border-white/10 bg-black/25 p-3"><p className="text-xs font-black text-white">{title}</p><p className="mt-1 text-xs text-white/50">{text}</p></div>)}</div></Card>

      <Card><SectionIntro title="1. Launch Gates" description="These are the major areas that decide if TheOutHaven is ready. Use Run Test on a single gate, or Run All P0 Tests at the top." />{gates.length === 0 ? <EmptyState onRepair={repair} message="No launch gates loaded." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{gates.map((gate) => <div key={gate.id} className="rounded-2xl border border-white/10 bg-black/30 p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-black">{gate.title}</p><p className="text-xs text-white/45">{gate.priority} · {gate.owner || "Unassigned"}</p></div><Pill value={gate.status} /></div><p className="mt-2 text-xs text-white/45">Use this card to run a safe check and track the PR or test that proves this gate is working.</p><div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[11px] font-black uppercase text-red-200">Last test result</p><p className="mt-1 text-xs text-white/70">{automatedSummary(gate.notes)}</p><p className="mt-2 text-[11px] font-black uppercase text-white/35">Last checked</p><p className="mt-1 text-xs text-white/55">{formatDate(gate.last_checked)}</p></div><div className="flex shrink-0 flex-wrap gap-2"><button onClick={() => copyGateResult(gate)} className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-black text-white"><Clipboard className="mr-1 inline h-3 w-3" />Copy This Result</button><button onClick={() => runGate(gate.id)} disabled={runningGate === gate.id || runningAllP0} className="rounded-full bg-red-600 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-60">{runningGate === gate.id ? "Running..." : "Run Test"}</button></div></div><p className="mt-3 rounded-xl bg-white/[0.04] p-2 text-xs text-white/60"><span className="font-black text-white/80">Why this status: </span>{plainStatusMessage(gate.status)}</p></div><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><label className="space-y-1 text-[11px] font-black uppercase text-white/40">Status<StatusSelect row={gate} collection="items" onSave={save} /></label><label className="space-y-1 text-[11px] font-black uppercase text-white/40">Owner<Field row={gate} collection="items" name="owner" value={gate.owner} placeholder="Owner" onSave={save} /></label><label className="space-y-1 text-[11px] font-black uppercase text-white/40">Test URL<Field row={gate} collection="items" name="test_url" value={gate.test_url} placeholder="Paste test URL" onSave={save} /></label><label className="space-y-1 text-[11px] font-black uppercase text-white/40">GitHub PR<Field row={gate} collection="items" name="github_pr_url" value={gate.github_pr_url} placeholder="Paste PR link" onSave={save} /></label><label className="space-y-1 text-[11px] font-black uppercase text-white/40 sm:col-span-2">Codex task<Field row={gate} collection="items" name="codex_task_url" value={gate.codex_task_url} placeholder="Paste Codex task link" onSave={save} /></label></div><div className="mt-2"><Notes row={gate} collection="items" value={gate.notes} onSave={save} /></div></div>)}</div>}</Card>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]"><Card><SectionIntro title="2. Daily Task Board" description="Use this as your daily checklist. Only move today's task. Paste the PR link when a fix exists." /><div className="my-3 flex gap-2 overflow-x-auto">{["Week 1", "Week 2", "Week 3", "Week 4", "Final 2 Days"].map((week) => <button key={week} onClick={() => setTab(week)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${tab === week ? "bg-red-600 text-white" : "bg-white/10 text-white/70"}`}>{week}</button>)}</div>{weekTasks.length === 0 ? <EmptyState onRepair={repair} message="No tasks loaded for this week." /> : <div className="space-y-3">{weekTasks.map((task) => <div key={task.id} className="rounded-2xl border border-white/10 bg-black/25 p-3"><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><p className="text-xs font-black uppercase text-red-200">{task.day} · {task.gate}</p><p className="mt-1 text-base font-black">{task.title}</p></div><StatusSelect row={task} collection="items" onSave={save} /></div><div className="mt-3 grid gap-2 md:grid-cols-2"><label className="space-y-1 text-[11px] font-black uppercase text-white/40">GitHub PR<Field row={task} collection="items" name="github_pr_url" value={task.github_pr_url} placeholder="Paste PR link after fix" onSave={save} /></label><label className="space-y-1 text-[11px] font-black uppercase text-white/40">Codex task<Field row={task} collection="items" name="codex_task_url" value={task.codex_task_url} placeholder="Paste Codex task link" onSave={save} /></label></div><div className="mt-2"><Notes row={task} collection="items" value={task.notes} onSave={save} /></div></div>)}</div>}</Card><Card><SectionIntro title="3. Search Reliability" description="Run each prompt in /create. Mark Passed if results are useful. Mark Blocked if the result is wrong or empty." /><div className="my-3 flex flex-wrap gap-2"><Link className="rounded-full bg-red-600 px-4 py-2 text-xs font-black" href="/admin/dashboard/search-health">Open Search Health <ExternalLink className="inline h-3 w-3" /></Link><Link className="rounded-full bg-white/10 px-4 py-2 text-xs font-black" href="/create">Open /create</Link><span className="rounded-full bg-emerald-500/15 px-4 py-2 text-xs font-black">{data.prompts.length ? Math.round((promptPassed / data.prompts.length) * 100) : 0}% · {promptPassed}/{data.prompts.length} passed</span></div><div className="space-y-2">{blockers.map((blocker) => <p key={blocker.id} className="rounded-xl bg-red-600/10 p-2 text-xs">{blocker.prompt} — {blocker.issue_type || "Blocker"}</p>)}</div><div className="mt-3 max-h-96 overflow-auto">{data.prompts.map((prompt) => <div key={prompt.id} className="mb-2 rounded-2xl border border-white/10 p-3"><button onClick={() => copy(prompt.prompt)} className="float-right text-white/50"><Clipboard className="h-4 w-4" /></button><p className="pr-8 text-sm font-black">{prompt.prompt}</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><StatusSelect row={prompt} collection="prompts" onSave={save} /><Field row={prompt} collection="prompts" name="issue_type" value={prompt.issue_type} placeholder="Issue type" onSave={save} /><Field row={prompt} collection="prompts" name="actual_result" value={prompt.actual_result} placeholder="What happened?" onSave={save} /><Field row={prompt} collection="prompts" name="github_pr_url" value={prompt.github_pr_url} placeholder="PR link" onSave={save} /></div></div>)}</div></Card></div>

      <div className="grid gap-5 xl:grid-cols-2"><Matrix data={data.access} save={save} /><Checklist title="Reserve Checklist" rows={check("reserve")} save={save} help="Use this when testing reservations, waitlist, and walk-ins." /><Checklist title="Beta Readiness" rows={check("beta")} save={save} help="Use this when testing beta signup and weekly task completion." /><Checklist title="Security Checklist" rows={check("security")} save={save} help="Use this before any larger launch or postcard campaign." /></div>

      <Card><div className="flex items-center gap-2"><ShieldAlert className="text-amber-200" /><h2 className="text-xl font-black">QR Claim Pilot</h2></div><p className="mt-1 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">Use this only for the first 25 postcard tests. Do not send more than 25 postcards until all P0 gates pass.</p><div className="mt-3 overflow-x-auto"><table className="min-w-[1200px] text-xs"><thead className="text-left uppercase text-white/45"><tr>{["#", "Location", "Claim URL", "QR", "Printed", "Mailed", "Scanned", "Submitted", "Approved", "Dashboard", "Status", "Notes"].map((heading) => <th key={heading} className="p-2">{heading}</th>)}</tr></thead><tbody>{data.qr.map((qr) => <tr key={qr.id} className="border-t border-white/10"><td>{qr.pilot_number}</td><td className="min-w-52"><Field row={qr} collection="qr" name="location_name" value={qr.location_name} onSave={save} /></td><td>{qr.claim_url}</td>{["qr_verified", "postcard_printed", "mailed", "scanned", "claim_submitted", "claim_approved", "owner_dashboard_works"].map((field) => <td key={field}><input type="checkbox" checked={!!qr[field]} onChange={(event) => save("qr", qr.id, { [field]: event.target.checked })} /></td>)}<td><StatusSelect row={qr} collection="qr" onSave={save} /></td><td className="min-w-52"><Notes row={qr} collection="qr" value={qr.notes} onSave={save} /></td></tr>)}</tbody></table></div></Card>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><Card><SectionIntro title="Production Command Results" description="Copy these commands and run them in terminal/Codex. This page only stores the result." />{data.commands.map((command) => <div key={command.id} className="mt-2 grid gap-2 rounded-2xl border border-white/10 p-3 md:grid-cols-[1fr_auto_auto]"><code className="text-xs text-red-100">{command.command}</code><button onClick={() => copy(command.command)} className="rounded-full bg-red-600 px-3 py-1 text-xs font-black">Copy</button><StatusSelect row={command} collection="commands" field="result" onSave={save} /><Notes row={command} collection="commands" value={command.notes} onSave={save} /></div>)}</Card><Card><CheckCircle2 className="h-8 w-8 text-emerald-300" /><h2 className="mt-2 text-xl font-black">Go / No-Go</h2><p className={`mt-2 text-3xl font-black ${kpi.overall === "Not Ready" ? "text-red-200" : kpi.overall === "Ready for Pilot" ? "text-blue-200" : "text-emerald-200"}`}>{kpi.overall}</p><p className="mt-2 text-sm text-white/55">Use this as the final decision. Not Ready means do not launch wider. Ready for Pilot means small controlled testing only. Ready for Production requires the stricter production thresholds.</p><div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3"><p className="text-xs font-black uppercase text-white/40">Decision reason</p><ul className="mt-2 space-y-1 text-xs text-white/65">{kpi.readinessReasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul></div>{decision && <div className="mt-3 space-y-2"><Field row={decision} collection="items" name="owner" value={decision.owner} placeholder="Reviewer" onSave={save} /><Notes row={decision} collection="items" value={decision.notes} onSave={save} /></div>}</Card></div>

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

function ScoreBreakdownCard({ breakdown, score }: { breakdown: ScoreBreakdown; score: number }) {
  const groups = [
    ["Launch Gates", `${breakdown.passedGates}/${breakdown.totalGates} passed`, `${breakdown.openP0Gates.length} P0 open · ${breakdown.openP1Gates.length} P1 open`],
    ["Production Commands", `${breakdown.passedCommands}/${breakdown.totalCommands} passed`, `${breakdown.notRunCommands.length} not run · ${breakdown.failedCommands.length} failed`],
    ["Reserve Checklist", `${breakdown.openReserveRows.length} open shown`, "Finish reservation/waitlist/walk-in checks"],
    ["Security Checklist", `${breakdown.openSecurityRows.length} open shown`, "Clear auth, cron, RLS, and storage review"],
    ["Beta Checklist", `${breakdown.openBetaRows.length} open shown`, "Clear beta signup and weekly completion"],
    ["Search Prompts", `${breakdown.openPromptRows.length} open shown`, "Run and mark prompt results"],
  ];
  return <Card className="border-blue-400/20 bg-blue-500/[0.06]"><SectionIntro title="Production readiness score breakdown" description={`Current score is ${score}%. This shows what is lowering the score and what to finish next.`} /><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{groups.map(([title, value, hint]) => <div key={title} className="rounded-2xl border border-white/10 bg-black/25 p-3"><p className="text-xs font-black uppercase text-white/40">{title}</p><p className="mt-2 text-xl font-black text-white">{value}</p><p className="mt-1 text-xs text-white/50">{hint}</p></div>)}</div><div className="mt-4 grid gap-3 lg:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-black/25 p-3"><p className="text-xs font-black uppercase text-red-200">Top next actions</p>{breakdown.nextActions.length ? <ol className="mt-2 space-y-1 text-sm text-white/70">{breakdown.nextActions.map((action) => <li key={action}>• {action}</li>)}</ol> : <p className="mt-2 text-sm text-emerald-100">No obvious next action. Review remaining manual checklist items.</p>}</div><div className="rounded-2xl border border-white/10 bg-black/25 p-3"><p className="text-xs font-black uppercase text-white/40">Open production gates</p><div className="mt-2 flex flex-wrap gap-2">{[...breakdown.openP0Gates, ...breakdown.openP1Gates].slice(0, 8).map((gate) => <span key={gate.id} className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold">{gate.priority} · {gate.title}</span>)}{!breakdown.openP0Gates.length && !breakdown.openP1Gates.length && <span className="text-sm text-emerald-100">All gates are clear.</span>}</div></div></div></Card>;
}

function Matrix({ data, save }: any) {
  return <Card><SectionIntro title="Access Matrix" description="Use this to test each role. Passed means the role saw the correct page. False no access means a valid user was incorrectly blocked." /><div className="mt-3 overflow-x-auto"><table className="min-w-[900px] text-xs"><thead><tr><th className="p-2 text-left">Role</th>{areas.map((area) => <th key={area} className="p-2 text-left">{area}</th>)}</tr></thead><tbody>{roles.map((role) => <tr key={role} className="border-t border-white/10"><td className="font-black">{role}</td>{areas.map((area) => { const row = data.find((item: Row) => item.role_name === role && item.area_name === area); return <td key={area} className="p-1 align-top">{row && <><StatusSelect row={row} collection="access" onSave={save} /><Notes row={row} collection="access" value={row.notes} onSave={save} /></>}</td>; })}</tr>)}</tbody></table></div></Card>;
}

function Checklist({ title, rows, save, help }: any) {
  return <Card><SectionIntro title={title} description={help || "Test each checklist item and write what happened."} />{rows.length === 0 ? <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">No checklist rows loaded. Use Repair missing defaults.</p> : <div className="mt-3 space-y-2">{rows.map((row: Row) => <div key={row.id} className="grid gap-2 rounded-2xl border border-white/10 p-3 sm:grid-cols-[1fr_auto]"><p className="font-bold">{row.title}</p><StatusSelect row={row} collection="items" onSave={save} /><div className="sm:col-span-2"><Notes row={row} collection="items" value={row.notes} onSave={save} /></div></div>)}</div>}</Card>;
}
