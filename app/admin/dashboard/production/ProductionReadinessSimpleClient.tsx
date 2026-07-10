"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Clipboard, ExternalLink, RefreshCw, Rocket, ShieldCheck, Wrench } from "lucide-react";
import { statusLabels } from "@/lib/production-finish-line/seeds";

type Row = Record<string, any>;
type Data = { items: Row[]; access: Row[]; qr: Row[]; commands: Row[]; prompts: Row[] };
type TestCard = {
  key: string;
  title: string;
  description: string;
  priority: "Critical" | "Production" | "Pilot";
  actionLabel: string;
  kind: "gate" | "section" | "commands";
  gateTitle?: string;
  section?: "access" | "reserve" | "beta" | "security";
};

const empty: Data = { items: [], access: [], qr: [], commands: [], prompts: [] };

const cards: TestCard[] = [
  { key: "public-seo", title: "Public Pages & SEO", description: "Tests home, create/search, public profile, claim, footer/legal links, metadata, and 404 risk.", priority: "Production", actionLabel: "Test Public Pages & SEO", kind: "gate", gateTitle: "Public Pages & SEO" },
  { key: "search", title: "Search Reliability", description: "Tests core outing prompts, empty-result risk, pair quality, and search readiness rows.", priority: "Critical", actionLabel: "Test Search Reliability", kind: "gate", gateTitle: "Search Reliability" },
  { key: "access", title: "Location Access & Roles", description: "Tests role/area expectations without showing the full access matrix by default.", priority: "Critical", actionLabel: "Test Location Access", kind: "section", section: "access", gateTitle: "Location Access" },
  { key: "owner", title: "Owner Dashboard", description: "Tests owner dashboard readiness and no-access risk.", priority: "Critical", actionLabel: "Test Owner Dashboard", kind: "gate", gateTitle: "Owner Dashboard" },
  { key: "reserve", title: "Reserve System", description: "Tests reservation, waitlist, walk-in, status flow, QR tools, and embed readiness. Demo writes stay off unless enabled.", priority: "Critical", actionLabel: "Test Reserve System", kind: "section", section: "reserve", gateTitle: "Reserve" },
  { key: "qr", title: "QR Claim Flow", description: "Tests QR claim readiness, pilot claim codes, and owner dashboard handoff.", priority: "Critical", actionLabel: "Test QR Claim Flow", kind: "gate", gateTitle: "QR Claim Flow" },
  { key: "beta", title: "Beta Program", description: "Tests beta signup, weekly flow, completion state, duplicate prevention, and email/reminder readiness.", priority: "Pilot", actionLabel: "Test Beta Program", kind: "section", section: "beta", gateTitle: "Beta Program" },
  { key: "billing", title: "Billing & Plans", description: "Tests plan/billing routes and Stripe configuration readiness without charging real payments.", priority: "Production", actionLabel: "Test Billing & Plans", kind: "gate", gateTitle: "Billing & Plans" },
  { key: "email", title: "Email, Cron & Monitoring", description: "Tests email sender settings, cron protection, digest/monitoring routes, and fail-closed behavior.", priority: "Production", actionLabel: "Test Email / Cron / Monitoring", kind: "gate", gateTitle: "Email, Cron & Monitoring" },
  { key: "security", title: "Security", description: "Tests admin/debug/cron route protection and flags items that still need human security review.", priority: "Critical", actionLabel: "Test Security", kind: "section", section: "security", gateTitle: "Security" },
  { key: "data", title: "Data Quality & Supabase", description: "Tests database readiness, seed/default rows, Supabase data quality, and schema-cache risk.", priority: "Production", actionLabel: "Test Data Quality", kind: "gate", gateTitle: "Data Quality & Supabase" },
  { key: "mobile", title: "Mobile QA", description: "Tests mobile route readiness and flags final visual checks before launch.", priority: "Production", actionLabel: "Test Mobile Readiness", kind: "gate", gateTitle: "Mobile QA" },
  { key: "pilot", title: "25-Card Pilot", description: "Tests the small postcard pilot setup without sending more than 25 cards.", priority: "Pilot", actionLabel: "Test 25-Card Pilot", kind: "gate", gateTitle: "25-Card Pilot" },
  { key: "commands", title: "Production Build & Commands", description: "Shows build/test commands that still need to pass before production readiness.", priority: "Critical", actionLabel: "Review Production Commands", kind: "commands", gateTitle: "Production Checks" },
];

function CardShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.6rem] border border-white/10 bg-[#111111]/90 p-4 shadow-2xl shadow-black/30 ${className}`}>{children}</section>;
}

function statusName(value?: string | null) {
  const key = value || "not_started";
  return statusLabels[key] || key.replaceAll("_", " ");
}

function statusClass(value?: string | null) {
  if (value === "passed") return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
  if (value === "blocked" || value === "needs_codex" || value === "failed") return "border-red-400/40 bg-red-600/20 text-red-100";
  if (value === "testing" || value === "in_progress") return "border-blue-400/30 bg-blue-500/15 text-blue-100";
  return "border-white/15 bg-white/[0.04] text-white/55";
}

function lastChecked(row?: Row) {
  const value = row?.last_checked || row?.updated_at;
  if (!value) return "Not tested yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not tested yet" : date.toLocaleString();
}

function automatedSummary(notes?: string | null) {
  const text = String(notes ?? "");
  const match = text.match(/Summary: ([^\n]+)/);
  if (match?.[1]) return match[1];
  const actual = text.match(/Actual: ([^\n]+)/);
  if (actual?.[1]) return actual[1];
  return text.trim() ? text.trim().split("\n").slice(0, 2).join(" ") : "No automated test has run yet.";
}

function priorityClass(priority: TestCard["priority"]) {
  if (priority === "Critical") return "border-red-400/30 bg-red-500/10 text-red-100";
  if (priority === "Pilot") return "border-blue-400/30 bg-blue-500/10 text-blue-100";
  return "border-amber-400/30 bg-amber-500/10 text-amber-100";
}

function codexPrompt(card: TestCard, status: string, summary: string) {
  return [
    "You are working in TheOutHaven current project.",
    "",
    `Production readiness area: ${card.title}`,
    `Current status: ${statusName(status)}`,
    `Observed result: ${summary}`,
    "",
    "Goal:",
    `Fix the production readiness issues for ${card.title}. Inspect the current repo first. Do not guess table names, route names, or columns. Keep the fix focused and production-safe.`,
    "",
    "Requirements:",
    "- Preserve existing production data.",
    "- Add or update tests where the repo already has a matching test pattern.",
    "- Do not add broad new features.",
    "- End with files changed and commands/tests run.",
  ].join("\n");
}

export default function ProductionReadinessSimpleClient({ adminName, adminRole }: { adminName: string; adminRole: string }) {
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState("");
  const [demoWrites, setDemoWrites] = useState(false);

  const load = async () => {
    setLoading(true);
    const response = await fetch("/api/admin/production-finish-line", { cache: "no-store" });
    const json = await response.json().catch(() => null);
    if (json?.success) setData(json.data);
    else setNotice(json?.error || "Could not load production readiness data.");
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const gates = data.items.filter((item) => item.item_type === "gate");
  const gateByTitle = (title?: string) => gates.find((gate) => gate.title === title);

  const cardStatus = (card: TestCard) => {
    if (card.kind === "commands") {
      const failed = data.commands.find((command) => ["failed", "blocked", "needs_codex"].includes(command.result || command.status));
      if (failed) return "needs_codex";
      const open = data.commands.filter((command) => !["passed", "skipped"].includes(command.result));
      return open.length ? "testing" : "passed";
    }
    return gateByTitle(card.gateTitle)?.status || "not_started";
  };

  const cardSummary = (card: TestCard) => {
    if (card.kind === "commands") {
      const passed = data.commands.filter((command) => command.result === "passed").length;
      return `${passed}/${data.commands.length} production commands passed.`;
    }
    const gate = gateByTitle(card.gateTitle);
    return automatedSummary(gate?.notes);
  };

  const readiness = useMemo(() => {
    const passed = cards.filter((card) => cardStatus(card) === "passed").length;
    const needsFix = cards.filter((card) => ["blocked", "needs_codex", "failed"].includes(cardStatus(card)));
    const needsReview = cards.filter((card) => ["testing", "in_progress", "not_started"].includes(cardStatus(card)));
    const score = cards.length ? Math.round((passed / cards.length) * 100) : 0;
    const overall = needsFix.length ? "Needs Fix" : score >= 90 ? "Ready for Production" : score >= 70 ? "Ready for Pilot" : "Not Ready";
    const mainIssue = needsFix[0]?.title || needsReview[0]?.title || "No major issue found";
    return { passed, needsFix, needsReview, score, overall, mainIssue };
  }, [data]);

  const copyText = async (text: string) => {
    await navigator.clipboard?.writeText(text);
    setNotice("Copied Codex fix prompt.");
  };

  const runGate = async (gateTitle: string) => {
    const gate = gateByTitle(gateTitle);
    if (!gate?.id) {
      setNotice(`${gateTitle} is not loaded. Click Repair missing defaults on the advanced page.`);
      return;
    }
    const response = await fetch("/api/admin/production-finish-line/run-gate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gateId: gate.id, mode: "single" }) });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) setNotice(json?.error || `${gateTitle} test failed.`);
    else setNotice(json.results?.[0]?.summary || `${gateTitle} test completed.`);
  };

  const runSection = async (section: NonNullable<TestCard["section"]>) => {
    const response = await fetch("/api/admin/production-finish-line/run-section", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ section, allowTestWrites: demoWrites && ["reserve", "beta"].includes(section) }) });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) setNotice(json?.error || `${section} test failed.`);
    else setNotice(json.summary || `${section} test completed.`);
  };

  const runCard = async (card: TestCard) => {
    setRunning(card.key);
    setNotice("");
    if (card.kind === "section" && card.section) await runSection(card.section);
    else if (card.kind === "gate" && card.gateTitle) await runGate(card.gateTitle);
    else setNotice("Run the listed production commands in terminal or Codex, then mark results on the advanced page.");
    await load();
    setRunning("");
  };

  const runFull = async () => {
    setRunning("full");
    setNotice("Running full safe production test...");
    for (const card of cards.filter((entry) => entry.kind !== "commands")) {
      if (card.kind === "section" && card.section) await runSection(card.section);
      if (card.kind === "gate" && card.gateTitle) await runGate(card.gateTitle);
    }
    await load();
    setRunning("");
    setNotice("Full safe production test completed. Review the issue list below for Codex-ready fixes.");
  };

  const visibleIssues = cards.filter((card) => cardStatus(card) !== "passed").slice(0, 6);

  return <main className="min-h-screen bg-[linear-gradient(135deg,#050505,#0d0d0f_45%,#160608)] px-4 pb-14 pt-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="rounded-[2rem] border border-white/10 bg-[#0b0b0c]/95 p-5 shadow-2xl shadow-black/40">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[.32em] text-red-300">Admin / Production Readiness</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">One-click production testing</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/65">A simple production test center. Click one button to run safe tests, or test one project area and copy a Codex-ready fix prompt.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={runFull} disabled={Boolean(running) || loading} className="rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"><Rocket className="mr-2 inline h-4 w-4" />{running === "full" ? "Testing project..." : "Run Full Production Test"}</button>
            <button onClick={load} className="rounded-full border border-white/10 bg-white/10 px-4 py-3 text-sm font-black"><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button>
            <Link href="/admin/dashboard/production/advanced" className="rounded-full border border-white/10 bg-white/10 px-4 py-3 text-sm font-black">Advanced details <ExternalLink className="ml-1 inline h-4 w-4" /></Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-black">{adminName} · {adminRole}</span>
          <label className="flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-100"><input type="checkbox" checked={demoWrites} onChange={(event) => setDemoWrites(event.target.checked)} /> Demo Test Mode for Reserve/Beta only</label>
        </div>
        {notice && <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">{notice}</p>}
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <CardShell><p className="text-xs font-black uppercase text-white/45">Status</p><p className={`mt-2 text-2xl font-black ${readiness.overall === "Needs Fix" || readiness.overall === "Not Ready" ? "text-red-200" : "text-emerald-200"}`}>{readiness.overall}</p><p className="mt-1 text-xs text-white/45">Main issue: {readiness.mainIssue}</p></CardShell>
        <CardShell><p className="text-xs font-black uppercase text-white/45">Readiness Score</p><p className="mt-2 text-2xl font-black">{readiness.score}%</p><p className="mt-1 text-xs text-white/45">{readiness.passed}/{cards.length} project areas passed</p></CardShell>
        <CardShell><p className="text-xs font-black uppercase text-white/45">Needs Fix</p><p className="mt-2 text-2xl font-black text-red-200">{readiness.needsFix.length}</p><p className="mt-1 text-xs text-white/45">Click Copy Codex Fix Prompt</p></CardShell>
        <CardShell><p className="text-xs font-black uppercase text-white/45">Needs Review</p><p className="mt-2 text-2xl font-black text-blue-200">{readiness.needsReview.length}</p><p className="mt-1 text-xs text-white/45">Run the test or open details</p></CardShell>
      </div>

      <CardShell className="border-red-500/20 bg-[#140707]/80">
        <div className="flex items-center gap-2"><ShieldCheck className="text-red-200" /><h2 className="text-xl font-black">Issues to fix next</h2></div>
        {visibleIssues.length ? <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleIssues.map((card) => {
          const status = cardStatus(card);
          const summary = cardSummary(card);
          return <div key={card.key} className="rounded-2xl border border-white/10 bg-black/30 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{card.title}</p><p className="mt-1 text-xs text-white/55">{summary}</p></div><span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${statusClass(status)}`}>{statusName(status)}</span></div><button onClick={() => copyText(codexPrompt(card, status, summary))} className="mt-3 rounded-full bg-red-600 px-4 py-2 text-xs font-black"><Clipboard className="mr-1 inline h-3 w-3" />Copy Codex Fix Prompt</button></div>;
        })}</div> : <p className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">No open issues found in the simplified test cards.</p>}
      </CardShell>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const gate = gateByTitle(card.gateTitle);
          const status = cardStatus(card);
          const summary = cardSummary(card);
          return <CardShell key={card.key}>
            <div className="flex items-start justify-between gap-3">
              <div><span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${priorityClass(card.priority)}`}>{card.priority}</span><h2 className="mt-3 text-xl font-black">{card.title}</h2></div>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${statusClass(status)}`}>{statusName(status)}</span>
            </div>
            <p className="mt-2 text-sm text-white/60">{card.description}</p>
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-xs font-black uppercase text-white/35">Last result</p>
              <p className="mt-1 text-sm text-white/70">{summary}</p>
              <p className="mt-2 text-xs text-white/40">Last tested: {lastChecked(gate)}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => runCard(card)} disabled={Boolean(running)} className="rounded-full bg-red-600 px-4 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-60">{running === card.key ? "Testing..." : card.actionLabel}</button>
              {status !== "passed" && <button onClick={() => copyText(codexPrompt(card, status, summary))} className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-black"><Clipboard className="mr-1 inline h-3 w-3" />Copy Fix Prompt</button>}
            </div>
          </CardShell>;
        })}
      </section>

      {loading && <p className="text-center text-white/50">Loading production readiness...</p>}
    </div>
  </main>;
}
