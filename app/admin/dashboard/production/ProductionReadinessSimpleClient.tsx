"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Clipboard, ExternalLink, RefreshCw, Rocket, ShieldCheck } from "lucide-react";
import { statusLabels } from "@/lib/production-finish-line/seeds";

type Row = Record<string, any>;
type Data = { items: Row[]; access: Row[]; qr: Row[]; commands: Row[]; prompts: Row[] };
type TestKind = "gate" | "section" | "commands";
type SectionKind = "access" | "reserve" | "security";
type Priority = "Critical" | "Production" | "Pilot";

type TestCard = {
  key: string;
  title: string;
  description: string;
  priority: Priority;
  actionLabel: string;
  kind: TestKind;
  gateTitle?: string;
  section?: SectionKind;
  requiredForPilot?: boolean;
};

type FixSummaryDetail = {
  checks: string[];
  likelyFiles: string[];
  discussionQuestions: string[];
  safeAutomation: string[];
};

const empty: Data = { items: [], access: [], qr: [], commands: [], prompts: [] };
const requiredCommands = ["npm run build", "npm run typecheck", "npm run lint"];

const cards: TestCard[] = [
  { key: "public-seo", title: "Public Pages & SEO", description: "Tests home, create/search, public profile, claim, footer/legal links, metadata, and 404 risk.", priority: "Production", actionLabel: "Test Public Pages & SEO", kind: "gate", gateTitle: "Public Pages & SEO", requiredForPilot: true },
  { key: "search", title: "Search Reliability", description: "Tests core outing prompts, empty-result risk, pair quality, and search readiness rows.", priority: "Critical", actionLabel: "Test Search Reliability", kind: "gate", gateTitle: "Search Reliability", requiredForPilot: true },
  { key: "access", title: "Location Access & Roles", description: "Tests role/area expectations without showing the full access matrix by default.", priority: "Critical", actionLabel: "Test Location Access", kind: "section", section: "access", gateTitle: "Location Access", requiredForPilot: true },
  { key: "owner", title: "Owner Dashboard", description: "Tests owner dashboard readiness and no-access risk.", priority: "Critical", actionLabel: "Test Owner Dashboard", kind: "gate", gateTitle: "Owner Dashboard", requiredForPilot: true },
  { key: "reserve", title: "Reserve System", description: "Tests reservation, waitlist, walk-in, status flow, QR tools, and embed readiness. Demo writes stay off unless enabled.", priority: "Critical", actionLabel: "Test Reserve System", kind: "section", section: "reserve", gateTitle: "Reserve", requiredForPilot: true },
  { key: "qr", title: "QR Claim Flow", description: "Tests QR claim readiness, pilot claim codes, and owner dashboard handoff.", priority: "Critical", actionLabel: "Test QR Claim Flow", kind: "gate", gateTitle: "QR Claim Flow", requiredForPilot: true },
  { key: "beta", title: "Beta Program", description: "Tests beta signup routes, weekly flow routes, admin review route, and duplicate/email proof without creating beta users.", priority: "Pilot", actionLabel: "Test Beta Program", kind: "gate", gateTitle: "Beta Program" },
  { key: "billing", title: "Billing & Plans", description: "Tests plan/billing routes and Stripe configuration readiness without charging real payments.", priority: "Production", actionLabel: "Test Billing & Plans", kind: "gate", gateTitle: "Billing & Plans" },
  { key: "email", title: "Email, Cron & Monitoring", description: "Tests email sender settings, cron protection, digest/monitoring routes, and fail-closed behavior.", priority: "Production", actionLabel: "Test Email / Cron / Monitoring", kind: "gate", gateTitle: "Email, Cron & Monitoring" },
  { key: "security", title: "Security", description: "Tests admin/debug/cron route protection and flags items that still need human security review.", priority: "Critical", actionLabel: "Test Security", kind: "section", section: "security", gateTitle: "Security", requiredForPilot: true },
  { key: "data", title: "Data Quality & Supabase", description: "Tests database readiness, seed/default rows, Supabase data quality, and schema-cache risk.", priority: "Production", actionLabel: "Test Data Quality", kind: "gate", gateTitle: "Data Quality & Supabase" },
  { key: "mobile", title: "Mobile QA", description: "Tests mobile route readiness and flags final visual checks before launch.", priority: "Production", actionLabel: "Test Mobile Readiness", kind: "gate", gateTitle: "Mobile QA" },
  { key: "pilot", title: "25-Card Pilot", description: "Tests the small postcard pilot setup without sending more than 25 cards.", priority: "Pilot", actionLabel: "Test 25-Card Pilot", kind: "gate", gateTitle: "25-Card Pilot" },
  { key: "commands", title: "Production Build & Commands", description: "Prioritizes build, typecheck, and lint for pilot readiness. Other commands remain important for production.", priority: "Critical", actionLabel: "Review Production Commands", kind: "commands", gateTitle: "Production Checks", requiredForPilot: true },
];

const fixDetails: Record<string, FixSummaryDetail> = {
  "public-seo": { checks: ["/ loads", "/create loads", "public location profile works", "/business/claim loads", "legal/footer links work", "metadata exists"], likelyFiles: ["app/page.tsx", "app/create/**", "app/locations/**", "app/business/claim/**", "layout/footer files", "lib/production-finish-line/gate-tests.ts"], discussionQuestions: ["Which route failed or still needs proof?", "Is Location Not Found happening for valid locations?", "Are Terms/Privacy/footer links correct?"], safeAutomation: ["Use read-only route requests", "Use one valid searchable/demo location", "Never change production location data"] },
  search: { checks: ["mixed outing prompts", "pair quality", "restaurant-only prompts", "activity-only prompts", "no text fallback"], likelyFiles: ["app/api/generate/**", "lib/search/**", "tests/search/**"], discussionQuestions: ["Which prompt failed?", "Was it empty, wrong category, no pairs, or slow?"], safeAutomation: ["Run safe prompts", "Store result summaries", "Do not mutate location data"] },
  access: { checks: ["admin roles", "owner scope", "view-only protection", "logged-out redirect", "demo isolation"], likelyFiles: ["lib/admin-auth.ts", "lib/location-access/**", "middleware.ts", "app/location/**"], discussionQuestions: ["Which role got a false no-access?", "Which role could edit incorrectly?"], safeAutomation: ["Route/session probes", "Do not grant broad permissions"] },
  owner: { checks: ["owner dashboard loads", "location editor links", "menu/photo/marketing routes", "demo context"], likelyFiles: ["app/location/dashboard/**", "app/admin/dashboard/demo/**", "lib/location-access/**"], discussionQuestions: ["Which link fails?", "Is selected location lost?"], safeAutomation: ["Use route checks first", "Demo/test writes only"] },
  reserve: { checks: ["reserve dashboard", "booking/embed", "QR tools", "demo reservation/waitlist/walk-in persistence", "status flow"], likelyFiles: ["app/reserve/**", "app/api/reserve/**", "lib/reservations/**"], discussionQuestions: ["Is it route loading, persistence, status, or assignment?", "Can demo writes be used?"], safeAutomation: ["Read-only by default", "Demo Test Mode only", "Clean up runner data"] },
  qr: { checks: ["claim URLs", "25-row pilot cap", "claim page", "review flow", "owner dashboard handoff"], likelyFiles: ["app/business/claim/**", "app/admin/dashboard/claim-qrs/**", "lib/production-finish-line/**"], discussionQuestions: ["Are claim URLs wrong?", "Does approval connect owner/location?"], safeAutomation: ["Validate pilot rows read-only", "Do not approve real claims"] },
  beta: { checks: ["beta signup route", "beta dashboard protection", "weekly route protection", "admin review route", "email/duplicate proof"], likelyFiles: ["app/beta/**", "app/user/dashboard/beta/**", "app/api/beta/**", "lib/beta/**", "email templates"], discussionQuestions: ["Is signup failing or just untested?", "Is email delivery or duplicate prevention missing proof?", "Should demo-write testing be added later?"], safeAutomation: ["Read-only route checks first", "No real beta users", "No real external email"] },
  billing: { checks: ["billing/plan pages", "plan names/prices", "Stripe config", "webhook protection", "no live charge"], likelyFiles: ["app/**billing**", "app/**plans**", "lib/stripe/**", "app/api/**stripe**"], discussionQuestions: ["UI only or Stripe test-mode readiness?", "Do prices match launch?"], safeAutomation: ["Never create live charges", "Use route/config checks"] },
  email: { checks: ["templates", "Resend config", "cron fail-closed", "manual triggers admin-gated", "monitoring/log routes"], likelyFiles: ["app/api/cron/**", "app/api/admin/**email**", "lib/email/**", "vercel.json"], discussionQuestions: ["Which email/cron job is launch-critical?", "Missing env, route auth, or template?"], safeAutomation: ["No live bulk emails", "Admin-gated test sends only"] },
  security: { checks: ["debug gated", "cron secrets", "service-role auth", "safe public payloads", "owner scope", "webhook signatures"], likelyFiles: ["middleware.ts", "lib/admin-api-auth.ts", "app/api/**", "supabase/migrations/**"], discussionQuestions: ["Which route failed protection?", "Public payload, admin auth, owner scope, or service role?"], safeAutomation: ["Route-probe only", "Never expose secrets"] },
  data: { checks: ["schema cache", "seed/default rows", "searchable locations", "photos/visibility", "claim refs"], likelyFiles: ["supabase/migrations/**", "lib/supabase**", "lib/production-finish-line/**"], discussionQuestions: ["Schema cache, missing rows, visibility, or data quality?", "Migration or seed repair?"], safeAutomation: ["Read-only counts", "Repair only known defaults"] },
  mobile: { checks: ["mobile route smoke", "no overflow", "CTA visible", "footer/sidebar safe", "cards readable"], likelyFiles: ["app/page.tsx", "app/create/**", "app/locations/**", "components/**"], discussionQuestions: ["Which page breaks?", "Overflow, sidebar, image, or CTA?"], safeAutomation: ["Route smoke first", "Final visual review manual"] },
  pilot: { checks: ["25 pilot rows", "claim URLs", "QR states", "pilot cap"], likelyFiles: ["lib/production-finish-line/seeds.ts", "app/business/claim/**", "app/admin/dashboard/claim-qrs/**"], discussionQuestions: ["Rows missing?", "Which locations assigned?"], safeAutomation: ["Do not mail/send automatically", "Verify rows and URLs only"] },
  commands: { checks: ["npm run build", "npm run typecheck", "npm run lint", "search/reserve/beta tests", "admin route/env audit"], likelyFiles: ["package.json", "tests/**", "scripts/**", "app/**", "lib/**"], discussionQuestions: ["Which command failed?", "Build, typecheck, lint, or test logic?"], safeAutomation: ["Required first: build/typecheck/lint", "Paste exact failing log before fixing"] },
};

function CardShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.6rem] border border-white/10 bg-[#111111]/90 p-4 shadow-2xl shadow-black/30 ${className}`}>{children}</section>;
}

function statusName(value?: string | null) {
  const key = value || "not_started";
  if (key === "testing" || key === "in_progress") return "Needs final review";
  if (key === "needs_codex") return "Needs code fix";
  return statusLabels[key] || key.replaceAll("_", " ");
}

function statusClass(value?: string | null) {
  if (value === "passed") return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
  if (value === "blocked" || value === "needs_codex" || value === "failed") return "border-red-400/40 bg-red-600/20 text-red-100";
  if (value === "testing" || value === "in_progress") return "border-amber-400/30 bg-amber-500/15 text-amber-100";
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

function priorityClass(priority: Priority) {
  if (priority === "Critical") return "border-red-400/30 bg-red-500/10 text-red-100";
  if (priority === "Pilot") return "border-blue-400/30 bg-blue-500/10 text-blue-100";
  return "border-amber-400/30 bg-amber-500/10 text-amber-100";
}

function listBlock(title: string, items: string[]) {
  return [title, ...items.map((item) => `- ${item}`)].join("\n");
}

function fixSummary(card: TestCard, status: string, summary: string) {
  const detail = fixDetails[card.key];
  return [
    `Production readiness fix summary: ${card.title}`,
    "",
    `Current status: ${statusName(status)}`,
    `Observed result: ${summary}`,
    `Priority: ${card.priority}`,
    "",
    "What this area is supposed to prove:",
    card.description,
    "",
    listBlock("Checks to discuss before creating a fix:", detail.checks),
    "",
    listBlock("Likely files or areas to inspect:", detail.likelyFiles),
    "",
    listBlock("Questions to answer here first:", detail.discussionQuestions),
    "",
    listBlock("Safety rules for any future PR:", detail.safeAutomation),
    "",
    "Recommended next step:",
    `Paste this summary into chat and decide whether ${card.title} needs a code fix, better automation, or just final confirmation.`,
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
  const commandByName = (command: string) => data.commands.find((row) => String(row.command ?? "").trim() === command);

  const commandStatus = () => {
    const required = requiredCommands.map(commandByName);
    const failed = required.find((row) => ["failed", "blocked", "needs_codex"].includes(row?.result || row?.status));
    if (failed) return "needs_codex";
    const passed = required.filter((row) => row?.result === "passed" || row?.status === "passed").length;
    return passed === requiredCommands.length ? "passed" : "testing";
  };

  const cardStatus = (card: TestCard) => {
    if (card.kind === "commands") return commandStatus();
    return gateByTitle(card.gateTitle)?.status || "not_started";
  };

  const cardSummary = (card: TestCard) => {
    if (card.kind === "commands") {
      const passed = requiredCommands.filter((command) => {
        const row = commandByName(command);
        return row?.result === "passed" || row?.status === "passed";
      }).length;
      const allPassed = data.commands.filter((command) => command.result === "passed" || command.status === "passed").length;
      return `${passed}/${requiredCommands.length} required pilot commands passed. ${allPassed}/${data.commands.length} total commands passed.`;
    }
    const gate = gateByTitle(card.gateTitle);
    return automatedSummary(gate?.notes);
  };

  const readiness = useMemo(() => {
    const pilotCards = cards.filter((card) => card.requiredForPilot);
    const weightedScore = cards.reduce((sum, card) => {
      const status = cardStatus(card);
      if (status === "passed") return sum + 1;
      if (status === "testing" || status === "in_progress") return sum + 0.65;
      return sum;
    }, 0);
    const score = cards.length ? Math.round((weightedScore / cards.length) * 100) : 0;
    const pilotBlockers = pilotCards.filter((card) => ["blocked", "needs_codex", "failed", "not_started"].includes(cardStatus(card)));
    const needsFix = cards.filter((card) => ["blocked", "needs_codex", "failed"].includes(cardStatus(card)));
    const needsReview = cards.filter((card) => ["testing", "in_progress", "not_started"].includes(cardStatus(card)));
    const passed = cards.filter((card) => cardStatus(card) === "passed").length;
    const overall = needsFix.length ? "Needs Fix" : pilotBlockers.length ? "Not Ready" : score >= 90 ? "Ready for Production" : score >= 70 ? "Ready for Pilot" : "Not Ready";
    const mainIssue = needsFix[0]?.title || pilotBlockers[0]?.title || needsReview[0]?.title || "No major issue found";
    return { passed, needsFix, needsReview, score, overall, mainIssue, pilotBlockers };
  }, [data]);

  const copyText = async (text: string) => {
    await navigator.clipboard?.writeText(text);
    setNotice("Copied fix summary for discussion.");
  };

  const copyAllOpen = () => {
    const openCards = cards.filter((card) => cardStatus(card) !== "passed");
    const text = [
      "Production readiness fix summaries - all open areas",
      `Current overall status: ${readiness.overall}`,
      `Readiness score: ${readiness.score}%`,
      `Open areas: ${openCards.length}`,
      `Pilot blockers: ${readiness.pilotBlockers.length}`,
      "",
      ...openCards.map((card) => fixSummary(card, cardStatus(card), cardSummary(card))),
    ].join("\n\n---\n\n");
    copyText(text);
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

  const runSection = async (section: SectionKind) => {
    const response = await fetch("/api/admin/production-finish-line/run-section", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ section, allowTestWrites: demoWrites && section === "reserve" }) });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) setNotice(json?.error || `${section} test failed.`);
    else setNotice(json.summary || `${section} test completed.`);
  };

  const runCard = async (card: TestCard) => {
    setRunning(card.key);
    setNotice("");
    if (card.kind === "section" && card.section) await runSection(card.section);
    else if (card.kind === "gate" && card.gateTitle) await runGate(card.gateTitle);
    else setNotice("Run build, typecheck, and lint on Vercel/Codex, then mark results on the advanced page.");
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
    setNotice("Full safe production test completed. Review final-review items and copy summaries before opening fixes.");
  };

  const visibleIssues = cards.filter((card) => cardStatus(card) !== "passed").slice(0, 6);

  return <main className="min-h-screen bg-[linear-gradient(135deg,#050505,#0d0d0f_45%,#160608)] px-4 pb-14 pt-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="rounded-[2rem] border border-white/10 bg-[#0b0b0c]/95 p-5 shadow-2xl shadow-black/40">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[.32em] text-red-300">Admin / Production Readiness</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">One-click production testing</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/65">Pilot scoring now prioritizes build, typecheck, lint, and critical launch checks. “Testing” is shown as “Needs final review” so it does not look like a broken feature.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={runFull} disabled={Boolean(running) || loading} className="rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"><Rocket className="mr-2 inline h-4 w-4" />{running === "full" ? "Testing project..." : "Run Full Production Test"}</button>
            <button onClick={copyAllOpen} className="rounded-full border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-50"><Clipboard className="mr-2 inline h-4 w-4" />Copy All Fix Summaries</button>
            <button onClick={load} className="rounded-full border border-white/10 bg-white/10 px-4 py-3 text-sm font-black"><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button>
            <Link href="/admin/dashboard/production/advanced" className="rounded-full border border-white/10 bg-white/10 px-4 py-3 text-sm font-black">Advanced details <ExternalLink className="ml-1 inline h-4 w-4" /></Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-black">{adminName} · {adminRole}</span>
          <label className="flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-100"><input type="checkbox" checked={demoWrites} onChange={(event) => setDemoWrites(event.target.checked)} /> Demo Test Mode for Reserve only</label>
        </div>
        {notice && <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">{notice}</p>}
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <CardShell><p className="text-xs font-black uppercase text-white/45">Status</p><p className={`mt-2 text-2xl font-black ${readiness.overall === "Needs Fix" || readiness.overall === "Not Ready" ? "text-red-200" : "text-emerald-200"}`}>{readiness.overall}</p><p className="mt-1 text-xs text-white/45">Main issue: {readiness.mainIssue}</p></CardShell>
        <CardShell><p className="text-xs font-black uppercase text-white/45">Readiness Score</p><p className="mt-2 text-2xl font-black">{readiness.score}%</p><p className="mt-1 text-xs text-white/45">Final-review items get partial pilot credit</p></CardShell>
        <CardShell><p className="text-xs font-black uppercase text-white/45">Pilot Blockers</p><p className="mt-2 text-2xl font-black text-red-200">{readiness.pilotBlockers.length}</p><p className="mt-1 text-xs text-white/45">Critical not passed/not reviewed</p></CardShell>
        <CardShell><p className="text-xs font-black uppercase text-white/45">Needs Final Review</p><p className="mt-2 text-2xl font-black text-amber-200">{readiness.needsReview.length}</p><p className="mt-1 text-xs text-white/45">Not necessarily broken</p></CardShell>
      </div>

      <CardShell className="border-red-500/20 bg-[#140707]/80">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><ShieldCheck className="text-red-200" /><h2 className="text-xl font-black">Issues to discuss next</h2></div><button onClick={copyAllOpen} className="rounded-full bg-red-600 px-4 py-2 text-xs font-black"><Clipboard className="mr-1 inline h-3 w-3" />Copy All Fix Summaries</button></div>
        {visibleIssues.length ? <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleIssues.map((card) => {
          const status = cardStatus(card);
          const summary = cardSummary(card);
          return <div key={card.key} className="rounded-2xl border border-white/10 bg-black/30 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{card.title}</p><p className="mt-1 text-xs text-white/55">{summary}</p></div><span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${statusClass(status)}`}>{statusName(status)}</span></div><button onClick={() => copyText(fixSummary(card, status, summary))} className="mt-3 rounded-full bg-red-600 px-4 py-2 text-xs font-black"><Clipboard className="mr-1 inline h-3 w-3" />Copy Fix Summary</button></div>;
        })}</div> : <p className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">No open issues found in the simplified test cards.</p>}
      </CardShell>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const gate = gateByTitle(card.gateTitle);
          const status = cardStatus(card);
          const summary = cardSummary(card);
          return <CardShell key={card.key}>
            <div className="flex items-start justify-between gap-3">
              <div><span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${priorityClass(card.priority)}`}>{card.priority}</span>{card.requiredForPilot && <span className="ml-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black uppercase text-emerald-100">Pilot required</span>}<h2 className="mt-3 text-xl font-black">{card.title}</h2></div>
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
              {status !== "passed" && <button onClick={() => copyText(fixSummary(card, status, summary))} className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-black"><Clipboard className="mr-1 inline h-3 w-3" />Copy Fix Summary</button>}
            </div>
          </CardShell>;
        })}
      </section>

      {loading && <p className="text-center text-white/50">Loading production readiness...</p>}
    </div>
  </main>;
}
