"use client";
/* eslint-disable react-hooks/static-components */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Readiness = {
  loginReady: boolean;
  authUserExists: boolean;
  authEmailConfirmed: boolean;
  betaTesterLinked: boolean;
  betaTesterUserId: string | null;
  betaTesterStatus: string | null;
  launchEmailVerified: boolean;
  launchEmailVerifiedAt: string | null;
  needsSetupEmail: boolean;
  reason: string;
};
type Eligibility = {
  isBetaTester: boolean;
  betaStatus: string | null;
  completedThisWeek: number;
  requiredThisWeek: number;
  weeklyTasksComplete: boolean;
  eligibilityStatus: string;
  reason: string;
};
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
  beta_application_status?: string | null;
  age_18_confirmed?: boolean | null;
  giveaway_rules_agreed?: boolean | null;
  prize_rules_confirmed?: boolean | null;
  weekly_task_eligibility_status?: string | null;
  beta_giveaway_eligibility?: Eligibility | null;
  beta_account_readiness?: Readiness | null;
};
type DuplicateEvent = {
  id: string;
  attempted_email: string | null;
  attempted_social_handle: string | null;
  conflict_type: string | null;
  created_at: string | null;
};
type Stats = {
  total: number;
  launchListOnly: number;
  giveawayEntries: number;
  loginReady: number;
  needsSetup: number;
  pendingVerification: number;
  verifiedEntries: number;
  missingSocialHandle: number;
  duplicateFlagged: number;
  winnerSelected: number;
};
type Application = { id: string; full_name?: string | null; name?: string | null; email?: string | null; status?: string | null; created_at?: string | null; tester_type?: string | null };
type Feedback = { id: string; message?: string | null; feedback_type?: string | null; feature_area?: string | null; search_query?: string | null; result_accuracy_rating?: number | null; created_at?: string | null; beta_testers?: { email?: string | null; name?: string | null; full_name?: string | null } | null };
type BugReport = { id: string; title?: string | null; severity?: string | null; status?: string | null; priority?: string | null; feature_area?: string | null; created_at?: string | null; beta_testers?: { email?: string | null; name?: string | null; full_name?: string | null } | null };
type WeeklySession = { id: string; status?: string | null; test_mode?: boolean | null; week_number?: number | null; completed_steps?: unknown[] | null; created_at?: string | null; beta_testers?: { email?: string | null; name?: string | null; full_name?: string | null } | null };
type Overview = Record<string, number>;
type ActiveBetaUser = { id: string; user_id?: string | null; email?: string | null; name?: string | null; full_name?: string | null; status?: string | null; tester_type?: string | null; weekly_completed_tests?: number | null; weekly_required_tests?: number | null; created_at?: string | null; updated_at?: string | null; last_active_at?: string | null };

const tabs = [
  "Overview",
  "Applications",
  "Testers",
  "Weekly Beta",
  "Results & Feedback",
  "Bug Reports",
  "Bonus Entries",
  "Prize Outcomes",
  "Settings",
] as const;
const filters = [
  ["all", "All"],
  ["active_beta", "Active beta tester"],
  ["needs_setup", "Needs account setup"],
  ["missing_weekly", "Missing weekly tasks"],
  ["verified", "Prize qualified"],
  ["disqualified", "Disqualified"],
  ["winner", "Giveaway winner"],
] as const;
const weekFilters = [
  ["all", "All weeks"],
  ["1", "Week 1"],
  ["2", "Week 2"],
  ["3", "Week 3"],
  ["4", "Week 4"],
] as const;
const readinessFilters = [
  ["all", "All"],
  ["ready", "Ready"],
  ["missing", "Missing requirements"],
  ["review", "Needs admin review"],
] as const;
const csvColumns = [
  "full_name",
  "email",
  "phone",
  "wants_giveaway",
  "social_handle",
  "social_platform",
  "email_verified",
  "email_verified_at",
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
  "inline-flex min-w-[88px] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
function escapeCsv(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
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
function toneClass(tone = "slate") {
  return tone === "green"
    ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
    : tone === "amber"
      ? "border-amber-300/35 bg-amber-400/10 text-amber-100"
      : tone === "red"
        ? "border-red-300/35 bg-red-500/15 text-red-100"
        : tone === "sky"
          ? "border-sky-300/35 bg-sky-400/10 text-sky-100"
          : "border-white/10 bg-white/[0.07] text-white/70";
}
function Badge({ children, tone }: { children: string; tone?: string }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${toneClass(tone)}`}
    >
      {children}
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
function ready(entry: Entry) {
  return entry.beta_account_readiness?.loginReady || false;
}
function activeBeta(entry: Entry) {
  const status = String(
    entry.beta_giveaway_eligibility?.betaStatus ||
      entry.beta_account_readiness?.betaTesterStatus ||
      "",
  );
  return (
    Boolean(
      entry.beta_giveaway_eligibility?.isBetaTester ||
      entry.beta_account_readiness?.betaTesterLinked,
    ) && ["active", "approved"].includes(status)
  );
}
function instagramBonus(entry: Entry) {
  return Boolean(
    entry.followed_social &&
    ["instagram", "both"].includes(
      String(entry.social_platform || "").toLowerCase(),
    ),
  );
}
function tiktokBonus(entry: Entry) {
  return Boolean(
    entry.followed_social &&
    ["tiktok", "both"].includes(
      String(entry.social_platform || "").toLowerCase(),
    ),
  );
}
function totalEntries(entry: Entry) {
  return requirementsMet(entry)
    ? 1 + (instagramBonus(entry) ? 1 : 0) + (tiktokBonus(entry) ? 1 : 0)
    : 0;
}
function getStatuses(entry: Entry) {
  const betaAccess =
    entry.beta_application_status === "rejected"
      ? "Rejected"
      : activeBeta(entry)
        ? "Active"
        : "Needs setup";
  const account = ready(entry) ? "Account linked" : "Setup needs review";
  const el = entry.beta_giveaway_eligibility;
  const tasks = !activeBeta(entry)
    ? "Not Assigned"
    : (el?.requiredThisWeek || 0) < 1
      ? "Not Assigned"
      : el?.weeklyTasksComplete
        ? "Complete"
        : "Tasks incomplete";
  const social =
    instagramBonus(entry) || tiktokBonus(entry)
      ? "Bonus earned"
      : "No bonus yet";
  const prize =
    entry.giveaway_status === "winner"
      ? "Winner"
      : entry.giveaway_status === "alternate"
        ? "Alternate"
        : entry.giveaway_status === "disqualified"
          ? "Disqualified"
          : entry.giveaway_status === "verified"
            ? "Prize qualified"
            : "Missing requirements";
  return { betaAccess, account, tasks, social, prize };
}
function weeklyTaskLabel(entry: Entry) {
  const el = entry.beta_giveaway_eligibility;
  if (!activeBeta(entry))
    return entry.beta_account_readiness?.authUserExists
      ? "Auth exists, beta access not active"
      : "Tasks not assigned";
  if (!ready(entry)) return "Setup needs review";
  if ((el?.requiredThisWeek || 0) < 1) return "Tasks not assigned";
  if (el?.weeklyTasksComplete) return "Weekly goal complete";
  return `Weekly tasks incomplete (${el?.completedThisWeek || 0}/${el?.requiredThisWeek || 0})`;
}
function missingRequirements(entry: Entry) {
  const missing: string[] = [];
  const el = entry.beta_giveaway_eligibility;
  if (!activeBeta(entry)) missing.push("active beta tester");
  if (!ready(entry)) missing.push("account linked or setup reviewed");
  if (!el?.weeklyTasksComplete) missing.push("weekly beta tasks");
  if (!entry.age_18_confirmed) missing.push("18+ confirmation");
  if (!(entry.giveaway_rules_agreed || entry.prize_rules_confirmed))
    missing.push("giveaway rules agreement");
  if (entry.duplicate_flag) missing.push("duplicate review");
  if (entry.giveaway_status === "disqualified")
    missing.push("not disqualified");
  if (!entry.wants_giveaway) missing.push("giveaway opt-in");
  return missing;
}
function requirementsMet(entry: Entry) {
  return missingRequirements(entry).length === 0;
}
function calculateStats(list: Entry[]): Stats {
  return {
    total: list.length,
    launchListOnly: list.filter((e) => !e.wants_giveaway).length,
    giveawayEntries: list.filter((e) => e.wants_giveaway).length,
    loginReady: list.filter(ready).length,
    needsSetup: list.filter((e) => !ready(e)).length,
    pendingVerification: list.filter(
      (e) =>
        e.giveaway_status === "pending_verification" ||
        e.giveaway_status === "pending_beta_tasks",
    ).length,
    verifiedEntries: list.filter((e) => e.giveaway_status === "verified")
      .length,
    missingSocialHandle: list.filter(
      (e) => e.wants_giveaway && !e.social_handle,
    ).length,
    duplicateFlagged: list.filter((e) => e.duplicate_flag).length,
    winnerSelected: list.filter((e) => e.giveaway_status === "winner").length,
  };
}
function checklist(entry: Entry) {
  const el = entry.beta_giveaway_eligibility;
  return [
    ["Active beta tester", activeBeta(entry)],
    ["Account linked", ready(entry)],
    ["Weekly tasks complete", Boolean(el?.weeklyTasksComplete)],
    ["Optional bonus follows are not required", true],
    ["18+ confirmed", Boolean(entry.age_18_confirmed)],
    [
      "Giveaway rules agreed",
      Boolean(entry.giveaway_rules_agreed || entry.prize_rules_confirmed),
    ],
    ["No duplicate flag", !entry.duplicate_flag],
    ["Giveaway opt-in", Boolean(entry.wants_giveaway)],
  ] as const;
}

export default function GiveawayAdminClient({
  initialEntries,
  initialStats,
  duplicateEvents,
  initialApplications = [],
  initialFeedback = [],
  initialBugReports = [],
  initialWeeklySessions = [],
  initialOverview = {},
  initialActiveBetaUsers = [],
  initialWeeklyBetaEnabled = false,
}: {
  initialEntries: Entry[];
  initialStats: Stats;
  duplicateEvents: DuplicateEvent[];
  initialApplications?: Application[];
  initialFeedback?: Feedback[];
  initialBugReports?: BugReport[];
  initialWeeklySessions?: WeeklySession[];
  initialOverview?: Overview;
  initialActiveBetaUsers?: ActiveBetaUser[];
  initialWeeklyBetaEnabled?: boolean;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [stats, setStats] = useState(initialStats);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Overview");
  const [weeklyFilter, setWeeklyFilter] = useState("include");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState("");
  const [weeklyBetaEnabled, setWeeklyBetaEnabled] = useState(Boolean(initialWeeklyBetaEnabled));
  const [weeklySettingsSaving, setWeeklySettingsSaving] = useState(false);
  const [weeklyActionBusy, setWeeklyActionBusy] = useState("");
  const detailEntry = entries.find((entry) => entry.id === detailsId) || null;
  const visibleEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          [entry.full_name, entry.email, entry.social_handle, entry.phone].some(
            (v) =>
              String(v || "")
                .toLowerCase()
                .includes(q),
          );
        if (!matchesSearch) return false;
        if (filter === "needs_setup") return !ready(entry);
        if (filter === "active_beta") return activeBeta(entry);
        if (filter === "missing_weekly")
          return (
            activeBeta(entry) &&
            !entry.beta_giveaway_eligibility?.weeklyTasksComplete
          );
        if (filter === "verified") return entry.giveaway_status === "verified";
        if (filter === "winner") return entry.giveaway_status === "winner";
        if (filter === "disqualified")
          return entry.giveaway_status === "disqualified";
        if (filter === "duplicate_flagged")
          return Boolean(entry.duplicate_flag);
        return true;
      }),
    [entries, filter, search],
  );
  const standaloneActiveBetaUsers = initialActiveBetaUsers.filter((tester) => !visibleEntries.some((entry) => String(entry.email || "").toLowerCase() === String(tester.email || "").toLowerCase()));
  const statCards = useMemo(
    () => [
      ["Total beta applicants", initialOverview.totalApplicants ?? stats.total, "Applications received"],
      [
        "Active Beta Testers",
        initialActiveBetaUsers.length || entries.filter(activeBeta).length,
        "Active or approved",
      ],
      [
        "Prize-ready",
        entries.filter(requirementsMet).length,
        "Tags and social follows excluded",
      ],
      [
        "Needs Review",
        entries.filter((e) => missingRequirements(e).length > 0).length,
        "Missing one or more items",
      ],
      [
        "Missing Weekly Tasks",
        entries.filter(
          (e) =>
            activeBeta(e) && !e.beta_giveaway_eligibility?.weeklyTasksComplete,
        ).length,
        "Weekly steps incomplete",
      ],
      ["Total giveaway entries", initialOverview.totalGiveawayEntries ?? 0, "Base + optional bonuses"],
    ],
    [entries, stats, initialOverview, initialActiveBetaUsers],
  );
  async function loadEntries(nextFilter = "all") {
    setError("");
    setMessage("");
    const response = await fetch(
      `/api/admin/giveaway/entries?filter=${encodeURIComponent(nextFilter)}`,
    );
    const payload = await response
      .json()
      .catch(() => ({ success: false, error: "Unable to load entries." }));
    if (!response.ok || !payload.success) {
      setError(payload.error || "Unable to load entries.");
      return;
    }
    setEntries(payload.entries || []);
    setStats(payload.stats || calculateStats(payload.entries || []));
    setSelectedIds([]);
  }
  async function patchEntry(entry: Entry, updates: Record<string, unknown>) {
    setMessage("");
    setError("");
    if (updates.giveaway_status === "verified" && !requirementsMet(entry)) {
      setError(
        `This tester is not prize-ready yet. They still need: ${missingRequirements(entry).join(", ")}.`,
      );
      return;
    }
    setBusyEntryId(entry.id);
    const response = await fetch(`/api/admin/giveaway/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const payload = await response
      .json()
      .catch(() => ({ error: "Update failed" }));
    if (!response.ok) setError(payload.error || "Update failed");
    else {
      setEntries((cur) => {
        const next = cur.map((i) => (i.id === entry.id ? payload.entry : i));
        setStats(calculateStats(next));
        return next;
      });
      setMessage(payload.message || "Entry updated.");
    }
    setBusyEntryId(null);
  }
  async function bulkAction(action: string) {
    const chosen = entries.filter((e) => selectedIds.includes(e.id));
    if (!chosen.length) {
      setError("Select at least one tester first.");
      return;
    }
    if (action === "mark_prize_qualified") {
      const blocked = chosen.filter((e) => !requirementsMet(e));
      if (blocked.length) {
        setError(
          `Cannot bulk mark prize qualified. ${blocked[0].email || "A selected user"} still needs: ${missingRequirements(blocked[0]).join(", ")}.`,
        );
        return;
      }
    }
    setBulkBusy(action);
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/giveaway/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds, action }),
    });
    const payload = await response
      .json()
      .catch(() => ({ success: false, error: "Bulk action failed." }));
    if (!response.ok || !payload.success)
      setError(payload.error || "Bulk action failed.");
    else {
      setMessage(payload.message || "Bulk action completed.");
      await loadEntries("all");
    }
    setBulkBusy("");
  }
  function exportCsv() {
    const csv = [
      csvColumns.join(","),
      ...visibleEntries.map((e) =>
        csvColumns.map((c) => escapeCsv(e[c])).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "theouthaven-giveaway-review.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  function smartAction(entry: Entry): [string, Record<string, unknown>] {
    if (!activeBeta(entry))
      return ["Approve as Beta Tester", { action: "approve_beta" }];
    if (!ready(entry))
      return ["Resend Setup Email", { action: "resend_beta_invite" }];
    if (!entry.beta_giveaway_eligibility?.weeklyTasksComplete)
      return ["Assign Weekly Tasks", { action: "assign_beta_tasks" }];
    if (requirementsMet(entry) && entry.giveaway_status !== "verified")
      return ["Mark Prize Qualified", { giveaway_status: "verified" }];
    return ["View", {}];
  }
  function ActionButton({
    entry,
    label,
    updates,
    tone = "slate",
  }: {
    entry: Entry;
    label: string;
    updates: Record<string, unknown>;
    tone?: string;
  }) {
    return (
      <button
        disabled={busyEntryId === entry.id}
        onClick={() =>
          Object.keys(updates).length
            ? patchEntry(entry, updates)
            : setDetailsId(entry.id)
        }
        className={`${actionButtonClass} ${tone === "primary" ? "bg-rose-600 text-white" : tone === "green" ? "bg-emerald-600 text-white" : tone === "red" ? "bg-red-600 text-white" : "border border-white/10 bg-white/[0.08] text-white"}`}
      >
        {busyEntryId === entry.id ? "Working..." : label}
      </button>
    );
  }
  function MoreActions({ entry }: { entry: Entry }) {
    const actions = [
      ["Approve as beta tester", { action: "approve_beta" }],
      ["Repair Beta Access", { action: "repair_beta_access" }],
      ["Resend Setup Email", { action: "resend_beta_invite" }],
      ["Verify bonus follow", { action: "verify_social" }],
      ["Mark Prize Qualified", { giveaway_status: "verified" }],
      ["Disqualify", { giveaway_status: "disqualified" }],
      ["Mark Giveaway Winner", { giveaway_status: "winner" }],
      ["Mark Alternate", { giveaway_status: "alternate" }],
      ["Reset Outcome", { giveaway_status: "pending_verification" }],
    ] as const;
    return (
      <details className="relative">
        <summary className="inline-flex min-w-[72px] shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-[11px] font-black text-white">
          More
        </summary>
        <div className="absolute right-0 z-30 mt-2 grid w-56 gap-1 rounded-2xl border border-white/10 bg-[#130807] p-2 shadow-2xl">
          {actions.map(([label, updates]) => (
            <button
              key={label}
              onClick={() => patchEntry(entry, updates)}
              className="rounded-xl px-3 py-2 text-left text-xs font-bold text-white/80 hover:bg-white/10"
            >
              {label}
            </button>
          ))}
        </div>
      </details>
    );
  }

  function WeeklyBetaPanel() {
    const realRows = entries.filter(activeBeta);
    const avg = realRows.length
      ? (
          realRows.reduce(
            (sum, e) =>
              sum + (e.beta_giveaway_eligibility?.completedThisWeek || 0),
            0,
          ) / realRows.length
        ).toFixed(1)
      : "0";
    async function saveWeeklyBetaEnabled(nextEnabled: boolean) {
      setError("");
      setMessage("");
      setWeeklySettingsSaving(true);
      try {
        const response = await fetch("/api/admin/giveaway/weekly-beta", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekly_beta_enabled: nextEnabled }),
        });
        const payload = await response
          .json()
          .catch(() => ({ success: false, error: "We couldn’t update the weekly beta setting. Please try again." }));
        if (!response.ok || !payload.success || typeof payload.weekly_beta_enabled !== "boolean") {
          setError(payload.error || "We couldn’t update the weekly beta setting. Please try again.");
          return;
        }
        setWeeklyBetaEnabled(payload.weekly_beta_enabled);
        setMessage(payload.message || (payload.weekly_beta_enabled ? "Weekly beta task turned on." : "Weekly beta task turned off."));
        router.refresh();
      } catch {
        setError("We couldn’t update the weekly beta setting. Please try again.");
      } finally {
        setWeeklySettingsSaving(false);
      }
    }
    async function weeklyPost(url: string, body?: Record<string, unknown>) {
      const action = String(body?.action || "weekly_action");
      if (action === "create_real_sessions" && !weeklyBetaEnabled) {
        setError("Turn on the real weekly beta task before creating real sessions.");
        return null;
      }
      setError("");
      setMessage("");
      setWeeklyActionBusy(action);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        const payload = await response
          .json()
          .catch(() => ({ success: false, error: `${action.replaceAll("_", " ")} failed.` }));
        if (!response.ok || !payload.success) {
          setError(payload.error || payload.message || `${action.replaceAll("_", " ")} failed.`);
          return null;
        }
        setMessage(payload.message || `${action.replaceAll("_", " ")} completed.`);
        if (["create_test_session", "reset_test_session", "delete_test_session", "create_real_sessions"].includes(action)) router.refresh();
        return payload;
      } catch {
        setError(`${action.replaceAll("_", " ")} failed.`);
        return null;
      } finally {
        setWeeklyActionBusy("");
      }
    }
    async function openTestWeeklyTask() {
      const payload = await weeklyPost("/api/admin/giveaway/weekly-beta", { action: "create_test_session" });
      if (payload?.success) router.push(payload.test_url || "/user/dashboard/beta/weekly?test=1");
    }
    return (
      <section className="space-y-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">
            Weekly Beta Program
          </p>
          <h2 className="mt-2 text-2xl font-black">Weekly Beta Program</h2>
          <p className="mt-2 text-sm text-white/60">
            Run the real weekly beta task or test the full weekly flow without
            counting it toward giveaway eligibility.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            [
              "Real Sessions Started",
              realRows.filter(
                (e) =>
                  (e.beta_giveaway_eligibility?.completedThisWeek || 0) > 0,
              ).length,
            ],
            [
              "Real Sessions Completed",
              realRows.filter(
                (e) => e.beta_giveaway_eligibility?.weeklyTasksComplete,
              ).length,
            ],
            ["Test Sessions", initialWeeklySessions.filter((s) => s.test_mode).length],
            ["Average Steps Completed", avg],
            [
              "Needs Reminder",
              realRows.filter(
                (e) => !e.beta_giveaway_eligibility?.weeklyTasksComplete,
              ).length,
            ],
          ].map(([l, v]) => (
            <div
              key={l}
              className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
                {l}
              </p>
              <p className="mt-2 text-2xl font-black text-white">{v}</p>
            </div>
          ))}
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h3 className="text-xl font-black">Weekly Beta Controls</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black">Run real weekly beta task</p>
                  <p className="mt-2 text-sm text-white/55">
                    {weeklyBetaEnabled
                      ? "Approved beta testers can access this week’s beta task."
                      : "Real weekly beta access is paused. Test mode is still available."}
                  </p>
                </div>
                <Badge tone={weeklyBetaEnabled ? "green" : "amber"}>
                  {weeklyBetaEnabled ? "Real weekly task: On" : "Real weekly task: Off"}
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  disabled={weeklySettingsSaving || weeklyBetaEnabled}
                  onClick={() => saveWeeklyBetaEnabled(true)}
                  className={`rounded-full px-4 py-2 text-xs font-black transition disabled:cursor-not-allowed ${weeklyBetaEnabled ? "bg-rose-600 text-white shadow-lg shadow-rose-950/40" : "border border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/[0.1]"}`}
                >
                  {weeklySettingsSaving ? "Saving…" : "On"}
                </button>
                <button
                  disabled={weeklySettingsSaving || !weeklyBetaEnabled}
                  onClick={() => saveWeeklyBetaEnabled(false)}
                  className={`rounded-full px-4 py-2 text-xs font-black transition disabled:cursor-not-allowed ${!weeklyBetaEnabled ? "bg-rose-600 text-white shadow-lg shadow-rose-950/40" : "border border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/[0.1]"}`}
                >
                  {weeklySettingsSaving ? "Saving…" : "Off"}
                </button>
                <button
                  disabled={!weeklyBetaEnabled}
                  onClick={() => weeklyPost("/api/admin/giveaway/weekly-beta", { action: "create_real_sessions" })}
                  className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-xs font-black text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45"
                  title={!weeklyBetaEnabled ? "Turn on the real weekly beta task before creating real sessions." : undefined}
                >
                  Create Real Weekly Sessions
                </button>
              </div>
              {!weeklyBetaEnabled ? <p className="mt-3 text-xs font-bold text-amber-100/80">Turn on the real weekly beta task before creating real sessions.</p> : null}
            </div>
            <div className="rounded-2xl border border-sky-300/20 bg-sky-500/10 p-4">
              <p className="font-black">End-to-end weekly beta test</p>
              <p className="mt-2 text-sm text-white/60">
                Test the full weekly beta flow, including emails, search,
                feedback, admin review, and reset, without counting anything
                toward real beta progress, giveaway eligibility, prize entries,
                or analytics.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["Create Test Weekly Session", "create_test_session"],
                  ["Send Test Weekly Email", "send_test_email"],
                  ["Send Test Reminder", "send_test_reminder"],
                  ["Reset Test Weekly Task", "reset_test_session"],
                  ["Delete Test Session", "delete_test_session"],
                ].map(([label, action]) => (
                  <button
                    key={action}
                    onClick={() =>
                      action === "reset_test_session" &&
                      !confirm(
                        "Reset this test weekly task? This only clears test-mode progress and does not affect real beta testers.",
                      )
                        ? null
                        : weeklyPost("/api/admin/giveaway/weekly-beta", { action })
                    }
                    disabled={weeklyActionBusy === action}
                    className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {weeklyActionBusy === action ? "Working…" : label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={openTestWeeklyTask}
                  disabled={weeklyActionBusy === "create_test_session"}
                  className="rounded-full bg-rose-600 px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {weeklyActionBusy === "create_test_session" ? "Opening…" : "Open Test Weekly Task"}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {[
            ["include", "Include test sessions"],
            ["real", "Real only"],
            ["test", "Test only"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setWeeklyFilter(v)}
              className={`rounded-full px-3 py-2 text-xs font-black ${weeklyFilter === v ? "bg-rose-600" : "bg-white/[0.06]"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-[0.16em] text-white/35">
              <tr>
                {[
                  "Tester",
                  "Mode",
                  "Week",
                  "Status",
                  "Steps Completed",
                  "Outing Sentence",
                  "Result Mode",
                  "Selected Result",
                  "Last Activity",
                  "Actions",
                ].map((h) => (
                  <th key={h} className="p-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.filter(activeBeta).map((e) => (
                <tr key={e.id} className="border-t border-white/10">
                  <td className="p-3 font-bold">
                    {formatText(e.full_name)}
                    <br />
                    <span className="text-xs text-white/45">
                      {formatText(e.email)}
                    </span>
                  </td>
                  <td className="p-3">
                    <Badge tone="green">Real</Badge>
                  </td>
                  <td className="p-3">Current</td>
                  <td className="p-3">
                    <Badge
                      tone={
                        e.beta_giveaway_eligibility?.weeklyTasksComplete
                          ? "green"
                          : "amber"
                      }
                    >
                      {e.beta_giveaway_eligibility?.weeklyTasksComplete
                        ? "Completed"
                        : "In progress"}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {e.beta_giveaway_eligibility?.completedThisWeek || 0}/5
                  </td>
                  <td className="p-3">User-written sentence</td>
                  <td className="p-3">Single or paired</td>
                  <td className="p-3">Reviewed in details</td>
                  <td className="p-3">
                    {formatDate(e.giveaway_verified_at || e.created_at)}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => setDetailsId(e.id)}
                      className="text-sky-200"
                    >
                      View details
                    </button>{" "}
                    ·{" "}
                    <button
                      onClick={() =>
                        weeklyPost("/api/admin/giveaway/weekly-beta", { action: "send_reminder" })
                      }
                      className="text-sky-200"
                    >
                      Send reminder
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }
  function SimpleList({ title, rows }: { title: string; rows: { id: string; title: string; meta: string; date?: string | null }[] }) {
    return <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><h2 className="text-2xl font-black">{title}</h2><div className="mt-4 grid gap-3">{rows.length ? rows.map((r) => <div key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><p className="font-black text-white">{r.title}</p><p className="mt-1 text-sm text-white/60">{r.meta}</p><p className="mt-1 text-xs text-white/35">{formatDate(r.date)}</p></div>) : <p className="text-sm text-white/55">No records yet.</p>}</div></section>;
  }

  function BonusEntriesPanel() {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-2xl font-black">Bonus Entries</h2>
        <p className="mt-2 text-sm text-white/60">
          Following @theouthaven on Instagram or TikTok is optional and adds
          bonus giveaway entries.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((e) => (
            <div
              key={e.id}
              className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"
            >
              <p className="font-black">{formatText(e.full_name)}</p>
              <p className="text-xs text-white/45">{formatText(e.email)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {instagramBonus(e) ? (
                  <Badge tone="green">
                    Instagram follow: Bonus entry earned
                  </Badge>
                ) : (
                  <Badge>Instagram follow: Not verified</Badge>
                )}
                {tiktokBonus(e) ? (
                  <Badge tone="green">TikTok follow: Bonus entry earned</Badge>
                ) : (
                  <Badge>TikTok follow: Not verified</Badge>
                )}
                <Badge tone="sky">{`Total giveaway entries: ${totalEntries(e)}`}</Badge>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function TesterTable() {
    return (
      <section className="w-full min-w-0 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#101012]/90 p-4 shadow-2xl shadow-black/25 sm:p-5">
        <div className="grid min-w-0 gap-3 xl:grid-cols-[1.35fr_minmax(220px,0.8fr)_minmax(150px,0.45fr)_minmax(180px,0.55fr)_auto] xl:items-end">
          <div className="min-w-0">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Status</p>
            <div className="flex min-w-0 flex-wrap gap-2">
            {filters.map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-black transition ${filter === value ? "bg-rose-600 text-white shadow-lg shadow-rose-950/40" : "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-white"}`}
              >
                {label}
              </button>
            ))}
            </div>
          </div>
          <label className="grid min-w-0 gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
            Search by name/email
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, or username"
              className="min-h-11 min-w-0 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold normal-case tracking-normal text-white outline-none placeholder:text-white/30 focus:border-rose-300/50 focus:ring-4 focus:ring-rose-300/10"
            />
          </label>
          <label className="grid min-w-0 gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
            Week
            <select
              className="min-h-11 rounded-2xl border border-white/10 bg-[#151518] px-3 py-5 text-xs font-black normal-case tracking-normal text-white outline-none focus:border-rose-300/50 focus:ring-4 focus:ring-rose-300/10"
              aria-label="Week filter"
            >
            {weekFilters.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
            Readiness
            <select
              className="min-h-11 rounded-2xl border border-white/10 bg-[#151518] px-3 py-5 text-xs font-black normal-case tracking-normal text-white outline-none focus:border-rose-300/50 focus:ring-4 focus:ring-rose-300/10"
              aria-label="Giveaway readiness filter"
            >
            {readinessFilters.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              id="export"
              onClick={exportCsv}
              className={`${actionButtonClass} min-h-11 border border-white/10 bg-white/[0.08] text-white hover:bg-white/[0.12]`}
            >
              Export Review List
            </button>
          </div>
        </div>
        {selectedIds.length ? <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-rose-300/20 bg-rose-500/10 p-3">
          <span className="py-1.5 text-xs font-black text-rose-100">
            {selectedIds.length} selected
          </span>
          {[
            ["resend_setup_email", "Resend setup email"],
            ["repair_beta_access", "Repair beta access"],
            ["verify_social", "Verify bonus follow"],
            ["mark_disqualified", "Mark disqualified"],
          ].map(([action, label]) => (
            <button
              key={action}
              disabled={bulkBusy === action}
              onClick={() => bulkAction(action)}
              className={`${actionButtonClass} border border-white/10 bg-white/[0.08] text-white`}
            >
              {bulkBusy === action ? "Working..." : label}
            </button>
          ))}
        </div> : null}
        <div className="mt-4 w-full max-w-full overflow-x-auto rounded-[1.25rem] border border-white/10 bg-black/20 pb-2 [scrollbar-color:rgba(244,63,94,0.55)_rgba(255,255,255,0.08)] [scrollbar-width:thin]">
          <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-left text-sm">
            <thead className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={
                      visibleEntries.length > 0 &&
                      visibleEntries.every((e) => selectedIds.includes(e.id))
                    }
                    onChange={(e) =>
                      setSelectedIds(
                        e.target.checked
                          ? visibleEntries.map((entry) => entry.id)
                          : [],
                      )
                    }
                  />
                </th>
                {[
                  ["Tester", "w-[240px]"],
                  ["Beta Status", "w-[125px]"],
                  ["Account", "w-[145px]"],
                  ["Weekly Progress", "w-[150px]"],
                  ["Bonus Entries", "w-[135px]"],
                  ["Total Entries", "w-[115px]"],
                  ["Prize Readiness", "w-[155px]"],
                  ["Last Activity", "w-[130px]"],
                  ["Actions", "w-[145px]"],
                ].map(([h, w]) => (
                  <th key={h} className={`${w} px-3 py-2 whitespace-nowrap`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEntries.length === 0 && standaloneActiveBetaUsers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center">
                    <p className="text-lg font-black text-white">No active beta testers yet.</p>
                    <p className="mt-2 text-sm text-white/55">Approve users for beta access from Users or Applications. Users with active beta access will appear here, including admin or superadmin test accounts.</p>
                  </td>
                </tr>
              ) : visibleEntries.length === 0 ? standaloneActiveBetaUsers.map((tester) => (
                <tr key={tester.id} className="border-t border-white/10 bg-white/[0.035] transition hover:bg-white/[0.06]">
                  <td className="px-3 py-5" />
                  <td className="px-3 py-5"><p className="font-black text-white">{formatText(tester.name || tester.full_name)}</p><p className="truncate text-xs text-white/58">{formatText(tester.email)}</p><p className="truncate text-xs text-white/40">{tester.tester_type || "user"}</p></td>
                  <td className="px-3 py-5"><Badge tone="green">Active</Badge></td>
                  <td className="px-3 py-5"><Badge tone={tester.user_id ? "green" : "amber"}>{tester.user_id ? "Account linked" : "Needs account link"}</Badge></td>
                  <td className="px-3 py-5"><Badge tone="amber">{`Weekly ${tester.weekly_completed_tests || 0}/${tester.weekly_required_tests || 5}`}</Badge></td>
                  <td className="px-3 py-5"><Badge>Not required</Badge></td>
                  <td className="px-3 py-5 text-sm font-black text-white">0</td>
                  <td className="px-3 py-5"><Badge>Beta access only</Badge></td>
                  <td className="px-3 py-5 text-xs font-bold text-white/55">{formatDate(tester.last_active_at || tester.updated_at || tester.created_at)}</td>
                  <td className="px-3 py-5"><span className="text-xs font-bold text-white/45">Manage from Users</span></td>
                </tr>
              )) : visibleEntries.map((entry) => {
                const s = getStatuses(entry);
                return (
                  <tr key={entry.id} className="border-t border-white/10 bg-white/[0.035] transition hover:bg-white/[0.06]">
                    <td className="px-3 py-5">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(entry.id)}
                        onChange={(e) =>
                          setSelectedIds((cur) =>
                            e.target.checked
                              ? [...cur, entry.id]
                              : cur.filter((id) => id !== entry.id),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-5">
                      <p className="font-black text-white">
                        {formatText(entry.full_name)}
                      </p>
                      <p className="max-w-[220px] break-words text-xs leading-5 text-white/58" title={formatText(entry.email)}>
                        {formatText(entry.email)}
                      </p>
                      <p className="max-w-[220px] break-words text-xs leading-5 text-white/40" title={entry.social_handle || undefined}>
                        {entry.social_handle
                          ? `${entry.social_handle} · ${formatText(entry.social_platform)}`
                          : "No social handle"}
                      </p>
                    </td>
                    <td className="px-3 py-5">
                      <Badge
                        tone={
                          s.betaAccess.includes("Active")
                            ? "green"
                            : s.betaAccess === "Rejected"
                              ? "red"
                              : "amber"
                        }
                      >
                        {s.betaAccess}
                      </Badge>
                    </td>
                    <td className="px-3 py-5">
                      <Badge
                        tone={
                          s.account === "Account linked" ? "green" : "amber"
                        }
                      >
                        {s.account}
                      </Badge>
                    </td>
                    <td className="px-3 py-5">
                      <Badge tone={s.tasks === "Complete" ? "green" : "amber"}>
                        {s.tasks}
                      </Badge>
                    </td>
                    <td className="px-3 py-5">
                      <div className="flex flex-wrap gap-1">
                        {instagramBonus(entry) ? (
                          <Badge tone="green">IG +1</Badge>
                        ) : null}
                        {tiktokBonus(entry) ? (
                          <Badge tone="green">TikTok +1</Badge>
                        ) : null}
                        {!instagramBonus(entry) && !tiktokBonus(entry) ? (
                          <Badge>No bonus yet</Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-5 text-sm font-black text-white">
                      <p>{totalEntries(entry)}</p>
                      {!requirementsMet(entry) ? <p className="mt-1 text-[11px] font-bold text-white/40">Not prize-ready yet</p> : null}
                    </td>
                    <td className="px-3 py-5">
                      <Badge
                        tone={
                          s.prize === "Prize qualified"
                            ? "green"
                            : s.prize === "Winner"
                              ? "amber"
                              : s.prize === "Disqualified"
                                ? "red"
                                : "slate"
                        }
                      >
                        {s.prize}
                      </Badge>
                    </td>
                    <td className="px-3 py-5 text-xs font-bold text-white/55">
                      {formatDate(
                        entry.giveaway_verified_at || entry.created_at,
                      )}
                    </td>
                    <td className="px-3 py-5">
                      <div className="flex min-w-max items-center justify-end gap-2">
                        <button
                          onClick={() => setDetailsId(entry.id)}
                          className={`${actionButtonClass} border border-white/10 bg-white/[0.08] text-white`}
                        >
                          View
                        </button>
                        <MoreActions entry={entry} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleEntries.length > 0 ? standaloneActiveBetaUsers.map((tester) => (
                <tr key={tester.id} className="border-t border-white/10 bg-white/[0.035] transition hover:bg-white/[0.06]">
                  <td className="px-3 py-5" />
                  <td className="px-3 py-5"><p className="font-black text-white">{formatText(tester.name || tester.full_name)}</p><p className="truncate text-xs text-white/58">{formatText(tester.email)}</p><p className="truncate text-xs text-white/40">{tester.tester_type || "user"}</p></td>
                  <td className="px-3 py-5"><Badge tone="green">Active</Badge></td>
                  <td className="px-3 py-5"><Badge tone={tester.user_id ? "green" : "amber"}>{tester.user_id ? "Account linked" : "Needs account link"}</Badge></td>
                  <td className="px-3 py-5"><Badge tone="amber">{`Weekly ${tester.weekly_completed_tests || 0}/${tester.weekly_required_tests || 5}`}</Badge></td>
                  <td className="px-3 py-5"><Badge>Not required</Badge></td>
                  <td className="px-3 py-5 text-sm font-black text-white">0</td>
                  <td className="px-3 py-5"><Badge>Beta access only</Badge></td>
                  <td className="px-3 py-5 text-xs font-bold text-white/55">{formatDate(tester.last_active_at || tester.updated_at || tester.created_at)}</td>
                  <td className="px-3 py-5"><span className="text-xs font-bold text-white/45">Manage from Users</span></td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>
      </section>
    );
  }
  return (
    <div className="w-full min-w-0 space-y-6">
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(([l, v, d]) => (
          <div
            key={l}
            className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
              {l}
            </p>
            <p className="mt-2 text-2xl font-black text-white">{v}</p>
            <p className="mt-1 text-[11px] font-bold text-white/35">{d}</p>
          </div>
        ))}
      </section>
      <nav className="flex min-w-0 gap-2 overflow-x-auto rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-black ${activeTab === tab ? "bg-rose-600 text-white" : "bg-white/[0.06] text-white/60"}`}
          >
            {tab}
          </button>
        ))}
      </nav>
      {message ? (
        <p className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-100">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm font-bold text-red-100">
          {error}
        </p>
      ) : null}
      {activeTab === "Testers" || activeTab === "Overview" ? (
        <TesterTable />
      ) : null}
      {activeTab === "Applications" ? <SimpleList title="Applications" rows={initialApplications.map((a) => ({ id: a.id, title: a.full_name || a.name || a.email || "Applicant", meta: `${a.email || "No email"} · ${a.status || "pending"} · ${a.tester_type || "user"}`, date: a.created_at }))} /> : null}
      {activeTab === "Weekly Beta" ? <WeeklyBetaPanel /> : null}
      {activeTab === "Bonus Entries" ? <BonusEntriesPanel /> : null}
      {activeTab === "Results & Feedback" ? <SimpleList title="Results & Feedback" rows={initialFeedback.map((f) => ({ id: f.id, title: f.message || f.feedback_type || "Feedback", meta: `${f.beta_testers?.email || "Unknown tester"} · ${f.feature_area || "general"} · Rating ${f.result_accuracy_rating ?? "—"} · ${f.search_query || "No search query"}`, date: f.created_at }))} /> : null}
      {activeTab === "Bug Reports" ? <SimpleList title="Bug Reports" rows={initialBugReports.map((b) => ({ id: b.id, title: b.title || "Bug report", meta: `${b.beta_testers?.email || "Unknown tester"} · ${b.severity || b.priority || "medium"} · ${b.status || "open"} · ${b.feature_area || "general"}`, date: b.created_at }))} /> : null}
      {activeTab === "Prize Outcomes" ? (
        <section className="grid gap-4 lg:grid-cols-3">
          {["winner", "alternate", "disqualified"].map((status) => (
            <div
              key={status}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-4"
            >
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">
                {status}
              </p>
              {entries
                .filter((entry) => entry.giveaway_status === status)
                .map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => setDetailsId(entry.id)}
                    className="mt-3 block w-full rounded-2xl bg-white/[0.05] p-3 text-left"
                  >
                    <span className="font-black text-white">
                      {formatText(entry.full_name)}
                    </span>
                    <span className="block text-xs text-white/55">
                      {formatText(entry.email)}
                    </span>
                  </button>
                ))}
            </div>
          ))}
        </section>
      ) : null}
      {activeTab === "Settings" ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-white/70">
          Settings are unchanged. Recent duplicate events loaded:{" "}
          {duplicateEvents.length}. Use entry details for notes and status
          changes.
        </section>
      ) : null}
      {detailEntry ? (
        <div
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => setDetailsId(null)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="ml-auto h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#0f0807] p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">
                  Tester Details
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  {formatText(detailEntry.full_name)}
                </h2>
                <p className="text-white/60">{formatText(detailEntry.email)}</p>
              </div>
              <button
                onClick={() => setDetailsId(null)}
                className="rounded-full border border-white/10 px-3 py-2 text-sm font-black"
              >
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field
                label="Social info"
                value={`${formatText(detailEntry.social_handle)} / ${formatText(detailEntry.social_platform)} · Follow ${yesNo(detailEntry.followed_social)} · Optional bonus intent ${yesNo(detailEntry.followed_social)}`}
              />
              <Field
                label="Account Status"
                value={detailEntry.beta_account_readiness?.reason}
              />
              <Field
                label="Linked beta user account"
                value={
                  detailEntry.beta_account_readiness?.authUserExists
                    ? "Account linked"
                    : "Setup needs review"
                }
              />
              <Field
                label="Email verification"
                value={yesNo(
                  detailEntry.beta_account_readiness?.authEmailConfirmed,
                )}
              />
              <Field
                label="Beta link"
                value={
                  detailEntry.beta_account_readiness?.betaTesterLinked
                    ? `Linked (${detailEntry.beta_account_readiness.betaTesterUserId || "no user id"})`
                    : "Not linked"
                }
              />
              <Field
                label="Launch email flag"
                value={
                  detailEntry.beta_account_readiness?.launchEmailVerified
                    ? `Synced (${formatDate(detailEntry.beta_account_readiness.launchEmailVerifiedAt)})`
                    : "Not synced"
                }
              />
              <Field
                label="Weekly task progress"
                value={weeklyTaskLabel(detailEntry)}
              />
              <Field
                label="Created/timing info"
                value={`${formatDate(detailEntry.created_at)} · Verified ${formatDate(detailEntry.giveaway_verified_at)}`}
              />
              <Field
                label="Feedback/bug summary"
                value="Review beta feedback and bug tabs for tester-linked records."
              />
              <Field
                label="Duplicate"
                value={
                  detailEntry.duplicate_flag
                    ? detailEntry.duplicate_reason || "Flagged"
                    : "No flag"
                }
              />
            </div>
            <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
                Prize checklist
              </p>
              <div className="mt-3 grid gap-2">
                {checklist(detailEntry).map(([label, ok]) => (
                  <div
                    key={label}
                    className="flex items-center gap-2 text-sm font-bold"
                  >
                    <span className={ok ? "text-emerald-300" : "text-red-300"}>
                      {ok ? "✓" : "✕"}
                    </span>
                    <span className="text-white/80">{label}</span>
                  </div>
                ))}
              </div>
            </section>
            <textarea
              defaultValue={detailEntry.giveaway_notes || ""}
              onBlur={(e) =>
                patchEntry(detailEntry, { giveaway_notes: e.target.value })
              }
              placeholder="Admin notes"
              className="mt-6 h-28 w-full rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white outline-none placeholder:text-white/30"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton
                entry={detailEntry}
                label="Repair Beta Access"
                updates={{ action: "repair_beta_access" }}
              />
              <ActionButton
                entry={detailEntry}
                label="Resend Setup Email"
                updates={{ action: "resend_beta_invite" }}
              />
              <ActionButton
                entry={detailEntry}
                label="Verify bonus follow"
                updates={{ action: "verify_social" }}
              />
              <ActionButton
                entry={detailEntry}
                label="Mark Prize Qualified"
                updates={{ giveaway_status: "verified" }}
                tone="green"
              />
              <ActionButton
                entry={detailEntry}
                label="Disqualify"
                updates={{ giveaway_status: "disqualified" }}
                tone="red"
              />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
