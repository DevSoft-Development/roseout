"use client";
/* eslint-disable react-hooks/static-components */

import { useMemo, useState } from "react";

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
type WeeklyTask = {
  id: string;
  title: string;
  status?: string | null;
  feature_area?: string | null;
  priority?: string | null;
};

const tabs = [
  "Overview",
  "Testers",
  "Weekly Tasks",
  "Results & Feedback",
  "Prize Outcomes",
  "Settings",
] as const;
const filters = [
  ["all", "All"],
  ["active_beta", "Active beta tester"],
  ["needs_setup", "Needs account setup"],
  ["missing_social", "Needs social verification"],
  ["missing_weekly", "Missing weekly tasks"],
  ["verified", "Prize qualified"],
  ["disqualified", "Disqualified"],
  ["winner", "Reward winner"],
] as const;
const weekFilters = [["all", "All weeks"], ["1", "Week 1"], ["2", "Week 2"], ["3", "Week 3"], ["4", "Week 4"]] as const;
const readinessFilters = [["all", "All"], ["ready", "Ready"], ["missing", "Missing requirements"], ["review", "Needs admin review"]] as const;
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
function socialReady(entry: Entry) {
  return Boolean(
    entry.followed_social &&
    entry.tagged_two_friends &&
    (entry.followed_social_verified_at || entry.followed_social) &&
    (entry.tagged_friends_verified_at || entry.tagged_two_friends),
  );
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
  const social = socialReady(entry) ? "Verified" : "Needs review";
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
  if (!entry.followed_social) missing.push("social follow verification");
    if (!entry.age_18_confirmed) missing.push("18+ confirmation");
  if (!(entry.giveaway_rules_agreed || entry.prize_rules_confirmed))
    missing.push("reward rules agreement");
  if (entry.duplicate_flag) missing.push("duplicate review");
  if (entry.giveaway_status === "disqualified")
    missing.push("not disqualified");
  if (!entry.wants_giveaway) missing.push("reward opt-in");
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
    ["Social follow verified", Boolean(entry.followed_social)],
    ["18+ confirmed", Boolean(entry.age_18_confirmed)],
    [
      "Reward rules agreed",
      Boolean(entry.giveaway_rules_agreed || entry.prize_rules_confirmed),
    ],
    ["No duplicate flag", !entry.duplicate_flag],
    ["Reward opt-in", Boolean(entry.wants_giveaway)],
  ] as const;
}

export default function GiveawayAdminClient({
  initialEntries,
  initialStats,
  duplicateEvents,
  initialWeeklyTasks = [],
}: {
  initialEntries: Entry[];
  initialStats: Stats;
  duplicateEvents: DuplicateEvent[];
  initialWeeklyTasks?: WeeklyTask[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [stats, setStats] = useState(initialStats);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Testers");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState("");
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
        if (filter === "missing_social") return !socialReady(entry);
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
  const statCards = useMemo(
    () => [
      ["Total Beta Entrants", stats.giveawayEntries, "Opted into giveaway"],
      ["Active Beta Testers", entries.filter(activeBeta).length, "Active or approved"],
      ["Eligible for Giveaway", entries.filter(requirementsMet).length, "Meets current requirements"],
      ["Needs Review", entries.filter((e) => missingRequirements(e).length > 0).length, "Missing one or more items"],
      [
        "Missing Weekly Tasks",
        entries.filter((e) => activeBeta(e) && !e.beta_giveaway_eligibility?.weeklyTasksComplete).length,
        "Weekly steps incomplete",
      ],
      ["Prize Qualified", stats.verifiedEntries, "Marked prize-ready"],
    ],
    [entries, stats],
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
      setError(`This tester is not prize-ready yet. They still need: ${missingRequirements(entry).join(", ")}.`);
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
    a.download = "theouthaven-beta-tester-reward.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  function smartAction(entry: Entry): [string, Record<string, unknown>] {
    if (!activeBeta(entry))
      return ["Repair Account", { action: "repair_beta_access" }];
    if (!ready(entry))
      return ["Resend Setup Email", { action: "resend_beta_invite" }];
    if (!entry.beta_giveaway_eligibility?.weeklyTasksComplete)
      return ["Assign Weekly Tasks", { action: "assign_beta_tasks" }];
    if (!entry.followed_social)
      return ["Verify Social", { action: "verify_social" }];
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
      ["Repair Beta Access", { action: "repair_beta_access" }],
      ["Resend Setup Email", { action: "resend_beta_invite" }],
      ["Verify Social", { action: "verify_social" }],
      ["View Bonus Entries", { action: "verify_tags" }],
      ["Mark Prize Qualified", { giveaway_status: "verified" }],
      ["Disqualify", { giveaway_status: "disqualified" }],
      ["Mark Reward Winner", { giveaway_status: "winner" }],
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
  function TesterTable() {
    return (
      <section className="w-full min-w-0 overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#101012]/90 p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-wrap gap-2">
            {filters.map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-black ${filter === value ? "bg-rose-600 text-white" : "bg-white/[0.06] text-white/60"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or username"
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/30"
          />
          <select className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 text-xs font-black text-white outline-none" aria-label="Week filter">
            {weekFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 text-xs font-black text-white outline-none" aria-label="Giveaway readiness filter">
            {readinessFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button
            id="export"
            onClick={exportCsv}
            className={`${actionButtonClass} border border-white/10 bg-white/[0.08] text-white`}
          >
            Export Review List
          </button>
        </div>
        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
          <span className="py-1.5 text-xs font-black text-white/50">
            {selectedIds.length} selected
          </span>
          {[
            ["resend_setup_email", "Resend setup email"],
            ["repair_beta_access", "Repair beta access"],
            ["verify_social", "Verify social follow"],
            ["verify_tags", "Verify tagged friends"],
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
        </div>
        <div className="mt-4 w-full max-w-full overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[1320px] table-fixed border-separate border-spacing-y-2 text-left text-sm">
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
                  ["Tester", "w-[260px]"],
                  ["Beta Status", "w-[145px]"],
                  ["Account", "w-[155px]"],
                  ["Weekly Progress", "w-[170px]"],
                  ["Social Verification", "w-[175px]"],
                  ["Giveaway Readiness", "w-[180px]"],
                  ["Last Activity", "w-[150px]"],
                  ["Actions", "w-[230px]"],
                ].map(([h, w]) => (
                  <th key={h} className={`${w} px-3 py-2 whitespace-nowrap`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry) => {
                const s = getStatuses(entry);
                const [, updates] = smartAction(entry);
                return (
                  <tr key={entry.id} className="rounded-2xl bg-white/[0.045]">
                    <td className="rounded-l-2xl px-3 py-3">
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
                    <td className="px-3 py-3"><p className="font-black text-white">{formatText(entry.full_name)}</p><p className="truncate text-xs text-white/58">{formatText(entry.email)}</p><p className="truncate text-xs text-white/40">{entry.social_handle ? `${entry.social_handle} · ${formatText(entry.social_platform)}` : "No social handle"}</p></td>
                    <td className="px-3 py-3">
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
                    <td className="px-3 py-3">
                      <Badge
                        tone={s.account === "Account linked" ? "green" : "amber"}
                      >
                        {s.account}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={s.tasks === "Complete" ? "green" : "amber"}>
                        {s.tasks}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={s.social === "Verified" ? "green" : "amber"}>
                        {s.social}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
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
                    <td className="px-3 py-3 text-xs font-bold text-white/55">{formatDate(entry.giveaway_verified_at || entry.created_at)}</td>
                    <td className="rounded-r-2xl px-3 py-3">
                      <div className="flex min-w-max items-center gap-2">
                        <button
                          onClick={() => setDetailsId(entry.id)}
                          className={`${actionButtonClass} border border-white/10 bg-white/[0.08] text-white`}
                        >
                          View
                        </button>
                        <ActionButton entry={entry} label="Review" updates={updates} tone="primary" />
                        <MoreActions entry={entry} />
                      </div>
                    </td>
                  </tr>
                );
              })}
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
      {activeTab === "Weekly Tasks" ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {initialWeeklyTasks.map((task) => (
            <div
              key={task.id}
              className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"
            >
              <p className="font-black">{task.title}</p>
              <p className="mt-2 text-sm text-white/55">
                {task.feature_area || "General"} · {task.priority || "normal"} ·{" "}
                {task.status || "draft"}
              </p>
            </div>
          ))}
        </section>
      ) : null}
      {activeTab === "Results & Feedback" ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-white/70">
          Feedback and bug summaries remain available from each tester detail
          panel.
        </section>
      ) : null}
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
                value={`${formatText(detailEntry.social_handle)} / ${formatText(detailEntry.social_platform)} · Follow ${yesNo(detailEntry.followed_social)} · Tags ${yesNo(detailEntry.tagged_two_friends)}`}
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
                label="Verify Social"
                updates={{ action: "verify_social" }}
              />
              <ActionButton
                entry={detailEntry}
                label="View Bonus Entries"
                updates={{ action: "verify_tags" }}
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
