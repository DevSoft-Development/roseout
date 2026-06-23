"use client";

import { useEffect, useMemo, useState, type ReactNode, type ButtonHTMLAttributes } from "react";

type Entry = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  wants_giveaway: boolean | null;
  social_handle: string | null;
  social_platform: string | null;
  email_verified: boolean | null;
  email_verified_at: string | null;
  marketing_consent: boolean | null;
  marketing_consent_at: string | null;
  sms_consent: boolean | null;
  sms_consent_at: string | null;
  email_consent: boolean | null;
  email_consent_at: string | null;
  followed_social: boolean | null;
  tagged_two_friends: boolean | null;
  followed_social_verified_at?: string | null;
  tagged_friends_verified_at?: string | null;
  giveaway_status: string | null;
  duplicate_flag: boolean | null;
  duplicate_reason: string | null;
  usually_go_out_area: string | null;
  giveaway_notes: string | null;
  created_at: string | null;
  giveaway_verified_at: string | null;
  beta_interest?: boolean | null; beta_application_status?: string | null; age_18_confirmed?: boolean | null; giveaway_rules_agreed?: boolean | null; weekly_task_eligibility_status?: string | null; beta_giveaway_eligibility?: { isBetaTester: boolean; betaStatus: string | null; testerId?: string | null; userId?: string | null; completedThisWeek: number; requiredThisWeek: number; weeklyTasksComplete: boolean; eligibilityStatus: string; reason: string; } | null;
};

type DuplicateEvent = {
  id: string;
  attempted_email: string | null;
  attempted_social_handle: string | null;
  attempted_social_platform: string | null;
  conflict_type: string | null;
  created_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
};

type Stats = {
  total: number;
  launchListOnly: number;
  giveawayEntries: number;
  emailUnverified: number;
  pendingVerification: number;
  verifiedEntries: number;
  missingSocialHandle: number;
  duplicateFlagged: number;
  winnerSelected: number;
};

const filters = [
  ["all", "All"],
  ["launch_list_only", "Program only"],
  ["giveaway_entries", "Beta Reward entries"],
  ["email_unverified", "Email unverified"],
  ["pending_verification", "Pending Prize Requirements"],
  ["verified", "Prize Qualified"],
  ["disqualified", "Disqualified"],
  ["winner", "Reward Winner"],
  ["alternate", "Alternate"],
  ["missing_social_handle", "Missing social handle"],
  ["duplicate_flagged", "Duplicate flagged"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["both", "Both"],
  ["followed_self_reported", "Social Follow self-reported"],
  ["tagged_self_reported", "Tagged Friends self-reported"],
];

const csvColumns = [
  "full_name",
  "email",
  "phone",
  "wants_giveaway",
  "social_handle",
  "social_platform",
  "email_verified",
  "email_verified_at",
  "marketing_consent",
  "marketing_consent_at",
  "sms_consent",
  "sms_consent_at",
  "email_consent",
  "email_consent_at",
  "followed_social",
  "tagged_two_friends",
  "age_18_confirmed",
  "giveaway_rules_agreed",
  "weekly_task_eligibility_status",
  "giveaway_status",
  "duplicate_flag",
  "duplicate_reason",
  "usually_go_out_area",
  "giveaway_notes",
  "created_at",
  "giveaway_verified_at",
] as const;

const actionButtonClass =
  "rounded-full px-3 py-1.5 text-[11px] font-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";

function escapeCsv(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatText(value: string | null | undefined) {
  return value?.trim() || "—";
}

function yesNo(value: boolean | null | undefined) {
  return value ? "Yes" : "No";
}

function calculateStats(list: Entry[]): Stats {
  return {
    total: list.length,
    launchListOnly: list.filter((entry) => !entry.wants_giveaway).length,
    giveawayEntries: list.filter((entry) => entry.wants_giveaway).length,
    emailUnverified: list.filter(
      (entry) => entry.giveaway_status === "email_unverified",
    ).length,
    pendingVerification: list.filter(
      (entry) => entry.giveaway_status === "pending_verification",
    ).length,
    verifiedEntries: list.filter(
      (entry) => entry.giveaway_status === "verified",
    ).length,
    missingSocialHandle: list.filter(
      (entry) => entry.wants_giveaway && !entry.social_handle,
    ).length,
    duplicateFlagged: list.filter((entry) => entry.duplicate_flag).length,
    winnerSelected: list.filter((entry) => entry.giveaway_status === "winner")
      .length,
  };
}

function statusBadgeClass(status: string | null) {
  switch (status) {
    case "verified":
      return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
    case "winner":
      return "border-amber-300/40 bg-amber-300/15 text-amber-100";
    case "disqualified":
      return "border-red-300/35 bg-red-500/15 text-red-100";
    case "alternate":
      return "border-sky-300/35 bg-sky-400/10 text-sky-100";
    case "email_unverified":
      return "border-orange-300/30 bg-orange-400/10 text-orange-100";
    case "pending_beta_tasks":
      return "border-amber-300/35 bg-amber-400/10 text-amber-100";
    default:
      return "border-white/10 bg-white/[0.07] text-white/70";
  }
}


function betaStatusLabel(entry: Entry) {
  const status = entry.beta_giveaway_eligibility?.betaStatus;
  if (entry.beta_application_status === "approved" || ["active", "approved"].includes(String(status || ""))) return "Beta: Approved";
  if (!entry.beta_giveaway_eligibility?.isBetaTester) return "Beta: Needs account link";
  return `Beta: ${formatText(status)}`;
}

function accountStatusLabels(entry: Entry) {
  const labels: string[] = [];
  if (!entry.email_verified) labels.push("Email verification pending");
  if (entry.beta_application_status === "approved" && !entry.beta_giveaway_eligibility?.isBetaTester) labels.push("Password/account not completed");
  return labels;
}

function weeklyTaskLabel(entry: Entry) {
  const eligibility = entry.beta_giveaway_eligibility;
  if (!eligibility?.isBetaTester) return entry.beta_application_status === "approved" ? "No beta tester row or account link missing" : "No beta tester row";
  if (eligibility.requiredThisWeek > 0 && eligibility.completedThisWeek === 0 && eligibility.reason?.includes("pending")) return `Tasks assigned/incomplete: 0 / ${eligibility.requiredThisWeek}`;
  return `${eligibility.completedThisWeek} / ${eligibility.requiredThisWeek} completed — ${eligibility.reason}`;
}

function StatusBadge({ status }: { status: string | null }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusBadgeClass(status)}`}
    >
      {formatText(status).replace(/_/g, " ")}
    </span>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-bold text-white/80">
        {value ?? "—"}
      </p>
    </div>
  );
}


function WeeklyTasksPanel({ setMessage, setError }: { setMessage: (v: string) => void; setError: (v: string) => void }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState({ title: "Run one search and rate the results", description: "Complete one quick TheOutHaven search and tell us if results match.", test_url: "/create", feature_area: "search_quality", priority: "medium", status: "draft" });
  async function load() { const r = await fetch("/api/admin/beta/weekly-tasks"); const p = await r.json().catch(() => ({})); if (p.success) setTasks(p.tasks || []); }
  useEffect(() => { load(); }, []);
  async function run(label: string, url: string, body?: any) { setLoading(true); setError(""); const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const p = await r.json().catch(() => ({})); if (!r.ok || !p.success) setError(p.error || `${label} failed.`); else { setMessage(`${label} complete.`); await load(); } setLoading(false); }
  async function saveTask(task: any, updates: any) { setLoading(true); const r = await fetch(`/api/admin/beta/weekly-tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) }); const p = await r.json().catch(() => ({})); if (!r.ok || !p.success) setError(p.error || "Task update failed."); else { setMessage("Task updated."); await load(); } setLoading(false); }
  const preview = `Hi there,\n\nThis week’s beta tasks should take less than 10 minutes each.\n\n${tasks.map((t, i) => `${i + 1}. ${t.email_summary || t.title}`).join("\n")}\n\nComplete weekly tasks to stay eligible for the $100 Beta Tester Reward.\n\nOpen your beta dashboard: /user/dashboard/beta`;
  return <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black">Weekly Tasks</h2><p className="mt-1 text-sm text-white/55">Create, review, approve, assign, and email tasks for TheOutHaven Beta Tester Program.</p></div><div className="flex flex-wrap gap-2"><button disabled={loading} onClick={() => run("Starter tasks", "/api/admin/beta/weekly-tasks/create-starter-set")} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-black">Create This Week’s Starter Tasks</button><button disabled={loading} onClick={() => run("Assigned tasks", "/api/admin/beta/weekly-tasks/assign")} className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#120606]">Assign to Beta Testers</button><button disabled={loading} onClick={() => run("Weekly email", "/api/admin/beta/weekly-tasks/send-email")} className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black">Send Weekly Email</button></div></div>
    <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]"><div className="space-y-3">{tasks.map((task) => <article key={task.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="grid gap-3 md:grid-cols-2"><input defaultValue={task.title} onBlur={(e) => saveTask(task, { title: e.target.value })} className="rounded-xl border border-white/10 bg-white/[0.06] p-3 text-sm font-bold text-white"/><input defaultValue={task.test_url || ""} onBlur={(e) => saveTask(task, { test_url: e.target.value })} placeholder="Task URL" className="rounded-xl border border-white/10 bg-white/[0.06] p-3 text-sm text-white"/></div><textarea defaultValue={task.description || task.instructions || ""} onBlur={(e) => saveTask(task, { description: e.target.value, instructions: e.target.value })} className="mt-3 h-20 w-full rounded-xl border border-white/10 bg-white/[0.06] p-3 text-sm text-white"/><div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/55"><span>{task.estimated_minutes || 10} min</span><span>Assigned: {task.assigned_count || 0}</span><span>Completed: {task.completed_count || 0}</span><button onClick={() => saveTask(task, { status: task.status === "active" ? "draft" : "active" })} className="rounded-full bg-emerald-600 px-3 py-1 font-black text-white">{task.status === "active" ? "Active" : "Approve/Activate"}</button><button onClick={() => run("Archived task", `/api/admin/beta/weekly-tasks/${task.id}/archive`)} className="rounded-full border border-white/10 px-3 py-1 font-black">Archive</button></div></article>)}{!tasks.length ? <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">No tasks for this week yet. Create this week’s starter tasks to auto-generate five quick tasks.</div> : null}</div><aside className="rounded-2xl border border-white/10 bg-black/20 p-4"><h3 className="text-lg font-black">Quick Task Builder</h3><p className="mt-1 text-xs text-white/50">Use a preset, then approve it before assigning.</p><input value={draft.title} onChange={(e)=>setDraft({...draft,title:e.target.value})} className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.06] p-3 text-sm font-bold text-white"/><textarea value={draft.description} onChange={(e)=>setDraft({...draft,description:e.target.value})} className="mt-3 h-24 w-full rounded-xl border border-white/10 bg-white/[0.06] p-3 text-sm text-white"/><button disabled={loading} onClick={() => run("Task created", "/api/admin/beta/weekly-tasks", draft)} className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-black text-[#120606]">Use Preset / Create Task</button><h3 className="mt-6 text-lg font-black">Preview tester email</h3><pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-black/30 p-3 text-xs leading-5 text-white/65">{preview}</pre></aside></div>
  </section>;
}


function ResultsFeedback({ entries, exportCsv }: { entries: Entry[]; exportCsv: () => void }) {
  const total = entries.length;
  const active = entries.filter((e) => e.beta_giveaway_eligibility?.userId).length;
  const assigned = entries.reduce((sum, e) => sum + Number(e.beta_giveaway_eligibility?.requiredThisWeek || 0), 0);
  const completed = entries.reduce((sum, e) => sum + Number(e.beta_giveaway_eligibility?.completedThisWeek || 0), 0);
  const qualified = entries.filter((e) => e.giveaway_status === "verified").length;
  const pending = entries.filter((e) => !["verified", "winner", "alternate", "disqualified"].includes(String(e.giveaway_status))).length;
  return <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-2xl font-black">Results & Feedback</h2><p className="mt-1 text-sm text-white/55">Enterprise view of beta task progress, reward readiness, feedback, and bug-report outcomes.</p></div><button onClick={exportCsv} className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#120606]">Export CSV</button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{[["Total beta testers",total],["Active beta testers",active],["Weekly tasks assigned",assigned],["Weekly tasks completed",completed],["Completion rate",assigned?`${Math.round((completed/assigned)*100)}%`:"0%"],["Prize qualified",qualified],["Pending requirements",pending],["Open feedback","Review in Beta Admin"],["Open bug reports","Review in Beta Admin"]].map(([label,value])=><div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">{label}</p><p className="mt-2 text-xl font-black text-white">{value}</p></div>)}</div><div className="space-y-3">{entries.map((entry)=><article key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black text-white">{formatText(entry.full_name)}</p><p className="text-sm text-white/55">{formatText(entry.email)} · {formatText(entry.social_handle)}</p></div><p className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1 text-xs font-black text-white/70">{entry.beta_giveaway_eligibility?.completedThisWeek || 0}/{entry.beta_giveaway_eligibility?.requiredThisWeek || 0} tasks</p></div><div className="mt-3 grid gap-3 text-sm text-white/60 md:grid-cols-4"><span>Account: {entry.beta_giveaway_eligibility?.userId ? "Login Ready" : "Needs setup"}</span><span>Feedback: see Beta Admin</span><span>Bugs: see Beta Admin</span><span>Prize: {formatText(entry.giveaway_status).replace(/_/g," ")}</span></div></article>)}</div></section>;
}

function PrizeOutcomes({ entries, patchEntry, busyEntryId }: { entries: Entry[]; patchEntry: (entry: Entry, updates: Record<string, unknown>) => Promise<void>; busyEntryId: string | null }) {
  const buckets = ["verified", "winner", "alternate", "disqualified", "pending_verification"];
  return <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5"><h2 className="text-2xl font-black">Prize Outcomes</h2><p className="text-sm text-white/55">Mark Reward Winner or Alternate only after an entry is Prize Qualified. Qualification is enforced by the server.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{buckets.map((status)=><div key={status} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">{status.replace(/_/g," ")}</p><p className="mt-2 text-2xl font-black">{entries.filter((e)=>String(e.giveaway_status||"pending_verification")===status).length}</p></div>)}</div><div className="space-y-3">{entries.filter((e)=>e.wants_giveaway).map((entry)=><article key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black">{formatText(entry.full_name)}</p><p className="text-sm text-white/55">{formatText(entry.email)} · {formatText(entry.giveaway_status).replace(/_/g," ")}</p></div><div className="flex flex-wrap gap-2"><button disabled={busyEntryId===entry.id || entry.giveaway_status!=="verified"} onClick={()=>patchEntry(entry,{giveaway_status:"winner"})} className="rounded-full bg-amber-400 px-3 py-1.5 text-xs font-black text-black disabled:opacity-40">Reward Winner</button><button disabled={busyEntryId===entry.id || entry.giveaway_status!=="verified"} onClick={()=>patchEntry(entry,{giveaway_status:"alternate"})} className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-40">Alternate</button><button disabled={busyEntryId===entry.id} onClick={()=>patchEntry(entry,{giveaway_status:"disqualified"})} className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-40">Disqualify</button><button disabled={busyEntryId===entry.id} onClick={()=>patchEntry(entry,{giveaway_status:"pending_verification"})} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-black disabled:opacity-40">Reset</button></div></div></article>)}</div></section>;
}

export default function GiveawayAdminClient({
  initialEntries,
  initialStats,
  duplicateEvents,
}: {
  initialEntries: Entry[];
  initialStats: Stats;
  duplicateEvents: DuplicateEvent[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [stats, setStats] = useState(initialStats);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Overview");

  const statCards = useMemo(
    () => [
      ["Total signups", stats.total, "Filtered list"],
      ["Program only", stats.launchListOnly, "No giveaway opt-in"],
      ["Giveaway entries", stats.giveawayEntries, "Opted into giveaway"],
      ["Email unverified", stats.emailUnverified, "Needs email check"],
      ["Pending", stats.pendingVerification, "Awaiting admin review"],
      ["Prize Qualified", stats.verifiedEntries, "Ready for drawing"],
      ["Missing social", stats.missingSocialHandle, "Needs handle"],
      ["Duplicate flags", stats.duplicateFlagged, "Needs review"],
      ["Reward Winners", stats.winnerSelected, "Selected entries"],
    ],
    [stats],
  );

  async function loadEntries(nextFilter = filter, nextSearch = search) {
    setIsLoading(true);
    setError("");
    setMessage("");

    const params = new URLSearchParams({
      filter: nextFilter,
      search: nextSearch,
    });
    const response = await fetch(
      `/api/admin/giveaway/entries?${params.toString()}`,
    );
    const payload = await response
      .json()
      .catch(() => ({ success: false, error: "Unable to load entries." }));

    if (!response.ok || !payload.success) {
      setError(payload.error || "Unable to load entries.");
      setIsLoading(false);
      return;
    }

    setEntries(payload.entries || []);
    setStats(payload.stats || calculateStats(payload.entries || []));
    setIsLoading(false);
  }

  async function patchEntry(entry: Entry, updates: Record<string, unknown>) {
    setMessage("");
    setError("");
    setBusyEntryId(entry.id);

    const response = await fetch(`/api/admin/giveaway/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const payload = await response
      .json()
      .catch(() => ({ error: "Update failed" }));

    if (!response.ok) {
      setError(payload.error || "Update failed");
      setBusyEntryId(null);
      return;
    }

    setEntries((current) => {
      const nextEntries = current.map((item) =>
        item.id === entry.id ? payload.entry : item,
      );
      setStats(calculateStats(nextEntries));
      return nextEntries;
    });
    setMessage("Entry updated.");
    setBusyEntryId(null);
  }

  async function deleteEntry(entry: Entry) {
    setMessage("");
    setError("");
    setBusyEntryId(entry.id);

    const response = await fetch(`/api/admin/giveaway/entries/${entry.id}`, {
      method: "DELETE",
    });
    const payload = await response
      .json()
      .catch(() => ({ error: "Delete failed" }));

    if (!response.ok || !payload.success) {
      setError(payload.error || "Delete failed");
      setBusyEntryId(null);
      return;
    }

    setEntries((current) => {
      const nextEntries = current.filter((item) => item.id !== entry.id);
      setStats(calculateStats(nextEntries));
      return nextEntries;
    });
    setDeleteConfirmId(null);
    setMessage("Entry deleted.");
    setBusyEntryId(null);
  }

  async function sendUserReminders() {
    setMessage("");
    setError("");
    setIsSendingReminders(true);

    const response = await fetch("/api/admin/giveaway/send-user-reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const payload = await response
      .json()
      .catch(() => ({ success: false, error: "Unable to send reminders." }));

    if (!response.ok || !payload.success) {
      setError(payload.error || "Unable to send reminders.");
      setIsSendingReminders(false);
      return;
    }

    setMessage(
      payload.message ||
        `Reminder emails sent to ${payload.sent || 0} users. Skipped ${
          payload.skipped || 0
        } users.`,
    );
    setIsSendingReminders(false);
  }

  function exportCsv() {
    const csv = [
      csvColumns.join(","),
      ...entries.map((entry) =>
        csvColumns.map((column) => escapeCsv(entry[column])).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "theouthaven-launch-giveaway.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function smartPrimary(entry: Entry) {
    const eligibility = entry.beta_giveaway_eligibility;
    const hasTester = Boolean(eligibility?.isBetaTester);
    const hasUser = Boolean(eligibility?.userId);
    if (!hasTester) return { label: "Repair Beta Access", updates: { action: "repair_beta_access" }, tone: "rose" };
    if (!hasUser) return { label: "Link Account", updates: { action: "link_beta_user" }, tone: "sky" };
    if (entry.beta_application_status === "approved" && !hasUser) return { label: "Resend Setup Email", updates: { action: "resend_beta_invite" }, tone: "sky" };
    if (eligibility?.requiredThisWeek === 0) return { label: "Assign Weekly Tasks", updates: { action: "assign_beta_tasks" }, tone: "amber" };
    if (!entry.followed_social_verified_at) return { label: "Verify Social Follow", updates: { action: "verify_social" }, tone: "white" };
    if (!entry.tagged_friends_verified_at) return { label: "Verify Tagged Friends", updates: { action: "verify_tags" }, tone: "white" };
    if (!eligibility?.weeklyTasksComplete) return { label: "View Task Progress", updates: {}, tone: "amber", tab: "Results & Feedback" };
    if (entry.giveaway_status !== "verified") return { label: "Mark Prize Qualified", updates: { giveaway_status: "verified" }, tone: "emerald" };
    return { label: "Mark Reward Winner", updates: { giveaway_status: "winner" }, tone: "gold" };
  }

  function betaAccessLabel(entry: Entry) {
    if (entry.beta_application_status === "rejected") return "Rejected";
    if (entry.beta_giveaway_eligibility?.isBetaTester && ["active", "approved"].includes(String(entry.beta_giveaway_eligibility.betaStatus || ""))) return entry.beta_giveaway_eligibility.userId ? "Active Beta Tester" : "Pending Setup";
    if (entry.beta_application_status === "approved") return "Pending Setup";
    return "Not Started";
  }
  function accountLabel(entry: Entry) { return entry.beta_giveaway_eligibility?.userId ? "Login Ready" : entry.beta_giveaway_eligibility?.isBetaTester || entry.beta_application_status === "approved" ? "Needs Password Setup" : "Account Linked"; }
  function weeklyTaskCleanLabel(entry: Entry) {
    const e = entry.beta_giveaway_eligibility;
    if (!e?.isBetaTester) return "Beta tester record missing";
    if (!e.userId) return "Account not linked yet";
    if (!e.requiredThisWeek) return "Tasks not assigned";
    if (!e.weeklyTasksComplete) return "Weekly tasks incomplete";
    return "Weekly goal complete";
  }
  function prizeLabel(entry: Entry) {
    if (entry.giveaway_status === "winner") return "Reward Winner";
    if (entry.giveaway_status === "alternate") return "Alternate";
    if (entry.giveaway_status === "disqualified") return "Disqualified";
    if (entry.giveaway_status === "verified") return "Prize Qualified";
    return "Pending Reward Requirements";
  }
  function badge(label: string, tone = "white") {
    const colors: Record<string,string> = { emerald: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100", amber: "border-amber-300/30 bg-amber-400/10 text-amber-100", rose: "border-rose-300/30 bg-rose-500/10 text-rose-100", sky: "border-sky-300/30 bg-sky-400/10 text-sky-100", gold: "border-yellow-300/40 bg-yellow-300/15 text-yellow-100", white: "border-white/10 bg-white/[0.07] text-white/70" };
    return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${colors[tone]}`}>{label}</span>;
  }

  function renderActions(entry: Entry) {
    const isBusy = busyEntryId === entry.id;
    const primary = smartPrimary(entry);
    const primaryClass = primary.tone === "emerald" ? "bg-emerald-500 text-white" : primary.tone === "gold" ? "bg-amber-400 text-black" : primary.tone === "sky" ? "bg-sky-600 text-white" : primary.tone === "amber" ? "bg-amber-500 text-black" : primary.tone === "rose" ? "bg-rose-700 text-white" : "bg-white text-[#120606]";
    return <div className="flex flex-wrap items-center gap-2 lg:justify-end">
      <button disabled={isBusy} onClick={() => primary.tab ? setActiveTab(primary.tab) : patchEntry(entry, primary.updates)} className={`${actionButtonClass} ${primaryClass}`}>{isBusy ? "Working..." : primary.label}</button>
      {entry.beta_application_status !== "approved" ? <button disabled={isBusy} onClick={() => patchEntry(entry, { action: "approve_beta" })} className={`${actionButtonClass} border border-emerald-300/30 bg-emerald-500/10 text-emerald-100`}>Approve Beta</button> : null}
      <details className="relative">
        <summary className="cursor-pointer list-none rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-[11px] font-black text-white">More Actions</summary>
        <div className="absolute right-0 z-20 mt-2 w-80 space-y-3 rounded-3xl border border-white/10 bg-[#130807] p-4 shadow-2xl">
          <ActionGroup title="Access actions">
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { action: "approve_beta" })}>Approve as Beta User</MiniAction>
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { action: "resend_beta_invite" })}>Resend Setup Email</MiniAction>
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { action: "link_beta_user" })}>Link Account</MiniAction>
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { action: "assign_beta_tasks" })}>Assign Weekly Tasks</MiniAction>
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { action: "repair_beta_access" })}>Repair Beta Access</MiniAction>
          </ActionGroup>
          <ActionGroup title="Verification actions">
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { action: "verify_social" })}>Verify Social Follow</MiniAction>
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { action: "verify_tags" })}>Verify Tagged Friends</MiniAction>
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { giveaway_status: "pending_beta_tasks" })}>Mark Pending Tasks</MiniAction>
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { giveaway_status: "verified" })}>Mark Prize Qualified</MiniAction>
          </ActionGroup>
          <ActionGroup title="Outcome actions">
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { giveaway_status: "disqualified" })}>Disqualify</MiniAction>
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { giveaway_status: "winner" })}>Reward Winner</MiniAction>
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { giveaway_status: "alternate" })}>Alternate</MiniAction>
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { giveaway_status: "pending_verification" })}>Reset</MiniAction>
          </ActionGroup>
          <ActionGroup title="Danger Zone">
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { duplicate_flag: false, duplicate_reason: "" })}>Clear duplicate</MiniAction>
            <MiniAction disabled={isBusy} onClick={() => patchEntry(entry, { duplicate_flag: true, duplicate_reason: "Admin marked for review" })}>Flag duplicate</MiniAction>
            {deleteConfirmId === entry.id ? <MiniAction disabled={isBusy} onClick={() => deleteEntry(entry)}>Confirm Delete</MiniAction> : <MiniAction disabled={isBusy} onClick={() => setDeleteConfirmId(entry.id)}>Delete</MiniAction>}
          </ActionGroup>
        </div>
      </details>
    </div>;
  }

  function ActionGroup({ title, children }: { title: string; children: ReactNode }) { return <details open={title !== "Danger Zone"} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><summary className="cursor-pointer text-xs font-black text-white/75">{title}</summary><div className="mt-2 grid grid-cols-1 gap-2">{children}</div></details>; }
  function MiniAction({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-left text-xs font-bold text-white hover:bg-white/[0.12] disabled:opacity-50">{children}</button>; }


  return (
    <div className="space-y-5">
      <section className="flex flex-wrap gap-2 rounded-3xl border border-white/10 bg-white/[0.04] p-3">{["Overview","Testers","Weekly Tasks","Results & Feedback","Prize Outcomes","Settings"].map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} className={`rounded-full px-4 py-2 text-sm font-black ${activeTab === tab ? "bg-rose-600 text-white" : "border border-white/10 bg-white/[0.06] text-white/65"}`}>{tab}</button>)}</section>
      {activeTab === "Weekly Tasks" ? <WeeklyTasksPanel setMessage={setMessage} setError={setError} /> : null}
      {activeTab === "Results & Feedback" ? <ResultsFeedback entries={entries} exportCsv={exportCsv} /> : null}
      {activeTab === "Prize Outcomes" ? <PrizeOutcomes entries={entries} patchEntry={patchEntry} busyEntryId={busyEntryId} /> : null}
      {activeTab !== "Weekly Tasks" && activeTab !== "Results & Feedback" && activeTab !== "Prize Outcomes" ? <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9">
        {statCards.map(([label, value, description]) => (
          <div
            key={label}
            className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/20"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
              {label}
            </p>
            <p className="mt-2 text-2xl font-black text-white">{value}</p>
            <p className="mt-1 text-[11px] font-bold text-white/35">
              {description}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-4 shadow-2xl shadow-black/20 sm:p-5">
        <p className="text-sm leading-6 text-white/70">
          Users are not fully entered until their email is verified. Social
          follow and tag checkboxes are self-reported. Use the submitted social
          handle to check the giveaway post comments. Admins receive a daily
          reminder email for users missing email verification, follow, 2 friend
          tags, or social handle. Verify that the user followed @TheOutHaven and
          tagged 2 friends in the giveaway post comments before marking the
          entry verified. Duplicate emails update the existing signup. Duplicate
          social handles across different emails should be reviewed or blocked. Approved beta testers must also complete the current weekly beta task requirement before an entry can be marked verified.
        </p>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 shadow-2xl shadow-black/20 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              loadEntries(event.target.value, search);
            }}
            className="rounded-2xl border border-white/10 bg-[#140807] px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-300/50"
          >
            {filters.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") loadEntries(filter, search);
            }}
            placeholder="Search name, email, social handle, phone"
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-rose-300/50"
          />
          <button
            disabled={isLoading}
            onClick={() => loadEntries(filter, search)}
            className="rounded-full bg-white px-5 py-3 text-sm font-black text-[#120606] disabled:opacity-60"
          >
            {isLoading ? "Loading..." : "Search"}
          </button>
          <button
            disabled={isSendingReminders}
            onClick={sendUserReminders}
            className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white transition hover:bg-rose-500 disabled:opacity-60"
          >
            {isSendingReminders ? "Sending..." : "Send User Reminders"}
          </button>
          <button
            onClick={exportCsv}
            className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-3 text-sm font-black text-white transition hover:bg-white/[0.12]"
          >
            Export CSV
          </button>
        </div>
      </section>

      {message ? (
        <p className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-50">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl border border-red-300/30 bg-red-500/10 p-3 text-sm font-bold text-red-50">
          {error}
        </p>
      ) : null}

      <section className="hidden space-y-4 md:block">
        <div className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-2xl shadow-black/20">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white/70">Entries</h2>
            <p className="mt-1 text-xs text-white/35">Compact card rows with stacked actions; no horizontal scrolling needed.</p>
          </div>
          {isLoading ? <span className="rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-black text-rose-100">Refreshing...</span> : null}
        </div>
        {entries.map((entry) => (
          <article key={entry.id} className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr_auto] lg:items-start">
              <div className="min-w-0">
                <p className="text-lg font-black text-white">{formatText(entry.full_name)}</p>
                <p className="mt-1 break-words text-sm font-bold text-white/70">{formatText(entry.email)}</p>
                <p className="mt-1 text-sm text-white/45">{formatText(entry.phone)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {badge(`Beta Access: ${betaAccessLabel(entry)}`, betaAccessLabel(entry).includes("Active") ? "emerald" : "amber")}
                  {badge(`Account: ${accountLabel(entry)}`, accountLabel(entry).includes("Login") ? "emerald" : "amber")}
                  {badge(entry.email_verified ? "Email Verified" : "Email Pending", entry.email_verified ? "emerald" : "amber")}
                  {badge(weeklyTaskCleanLabel(entry), weeklyTaskCleanLabel(entry).includes("complete") ? "emerald" : "amber")}
                  {badge(entry.followed_social_verified_at && entry.tagged_friends_verified_at ? "Social Verified" : "Needs Social Verification", entry.followed_social_verified_at && entry.tagged_friends_verified_at ? "emerald" : "amber")}
                  {badge(prizeLabel(entry), entry.giveaway_status === "verified" ? "emerald" : entry.giveaway_status === "winner" ? "gold" : "white")}
                </div>
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="Social" value={`${formatText(entry.social_handle)} / ${formatText(entry.social_platform)}`} />
                <Field label="Email verified" value={yesNo(entry.email_verified)} />
                <Field label="Follow" value={yesNo(entry.followed_social)} />
                <Field label="Tagged friends" value={yesNo(entry.tagged_two_friends)} />
                <Field label="Weekly beta tasks" value={weeklyTaskLabel(entry)} />
                <Field label="Created" value={formatDate(entry.created_at)} />
              </div>
              <div className="lg:w-80">{renderActions(entry)}</div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
              <textarea defaultValue={entry.giveaway_notes || ""} onBlur={(event) => patchEntry(entry, { giveaway_notes: event.target.value })} placeholder="Admin notes" className="h-20 w-full max-w-full rounded-2xl border border-white/10 bg-black/20 p-3 text-white outline-none placeholder:text-white/30 focus:border-rose-300/50" />
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-white/55">
                <p>ID {entry.id}</p>
                <p className="mt-1">Area: {formatText(entry.usually_go_out_area)} · Consent: {formatDate(entry.marketing_consent_at)}</p>
                {entry.duplicate_flag || entry.duplicate_reason ? <p className="mt-1 text-red-100">Duplicate: {yesNo(entry.duplicate_flag)} {entry.duplicate_reason || ""}</p> : null}
              </div>
            </div>
          </article>
        ))}
        {!entries.length ? <p className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-8 text-center text-sm font-bold text-white/45">No entries match this view.</p> : null}
      </section>

      <section className="space-y-3 md:hidden">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white/60">
            Entries
          </h2>
          {isLoading ? (
            <span className="rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-black text-rose-100">
              Refreshing...
            </span>
          ) : null}
        </div>
        {entries.map((entry) => (
          <article
            key={entry.id}
            className="rounded-3xl border border-white/10 bg-white/[0.05] p-4 shadow-2xl shadow-black/20"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-black text-white">
                  {formatText(entry.full_name)}
                </p>
                <p className="mt-1 break-words text-sm font-bold text-white/60">
                  {formatText(entry.email)}
                </p>
              </div>
              <StatusBadge status={entry.giveaway_status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Phone" value={formatText(entry.phone)} />
              <Field
                label="Type"
                value={entry.wants_giveaway ? "Giveaway" : "Launch List"}
              />
              <Field label="Social" value={formatText(entry.social_handle)} />
              <Field
                label="Platform"
                value={formatText(entry.social_platform)}
              />
              <Field label="Created" value={formatDate(entry.created_at)} />
              <Field
                label="Prize Qualified"
                value={formatDate(entry.giveaway_verified_at)}
              />
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">
              <p>
                Email verified:{" "}
                <span className="font-black text-white">
                  {yesNo(entry.email_verified)}
                </span>
              </p>
              <p className="mt-1">
                Social Follow:{" "}
                <span className="font-black text-white">
                  {yesNo(entry.followed_social)}
                </span>
              </p>
              <p className="mt-1">
                Tagged 2 friends:{" "}
                <span className="font-black text-white">
                  {yesNo(entry.tagged_two_friends)}
                </span>
              </p>
              <p className="mt-1">
                Duplicate flag:{" "}
                <span className="font-black text-white">
                  {yesNo(entry.duplicate_flag)}
                </span>
              </p>
              <p className="mt-1">18+ confirmed: <span className="font-black text-white">{yesNo(entry.age_18_confirmed)}</span></p>
              <p className="mt-1">Giveaway rules agreed: <span className="font-black text-white">{yesNo(entry.giveaway_rules_agreed)}</span></p>
              <p className="mt-1">Weekly beta tasks: <span className="font-black text-white">{weeklyTaskLabel(entry)}</span></p>
              {entry.duplicate_reason ? (
                <p className="mt-2 text-red-100">{entry.duplicate_reason}</p>
              ) : null}
            </div>
            <textarea
              defaultValue={entry.giveaway_notes || ""}
              onBlur={(event) =>
                patchEntry(entry, { giveaway_notes: event.target.value })
              }
              placeholder="Admin notes"
              className="mt-4 h-24 w-full rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-rose-300/50"
            />
            <div className="mt-4">{renderActions(entry)}</div>
          </article>
        ))}
        {!entries.length ? (
          <p className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-8 text-center text-sm font-bold text-white/45">
            No entries match this view.
          </p>
        ) : null}
      </section>

      </> : null}

      {duplicateEvents.length && activeTab !== "Weekly Tasks" && activeTab !== "Results & Feedback" && activeTab !== "Prize Outcomes" ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/20 sm:p-5">
          <h2 className="text-xl font-black">Duplicate audit events</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1000px] text-left text-xs text-white/65">
              <thead className="bg-white/[0.05] text-[10px] uppercase tracking-[0.16em] text-white/40">
                <tr>
                  {[
                    "attempted_email",
                    "attempted_social_handle",
                    "attempted_social_platform",
                    "conflict_type",
                    "created_at",
                    "ip_address",
                    "user_agent",
                  ].map((head) => (
                    <th key={head} className="px-3 py-2">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {duplicateEvents.map((event) => (
                  <tr key={event.id} className="border-t border-white/10">
                    <td className="px-3 py-2">{event.attempted_email}</td>
                    <td className="px-3 py-2">
                      {event.attempted_social_handle}
                    </td>
                    <td className="px-3 py-2">
                      {event.attempted_social_platform}
                    </td>
                    <td className="px-3 py-2">{event.conflict_type}</td>
                    <td className="px-3 py-2">
                      {formatDate(event.created_at)}
                    </td>
                    <td className="px-3 py-2">{event.ip_address}</td>
                    <td className="px-3 py-2">{event.user_agent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
