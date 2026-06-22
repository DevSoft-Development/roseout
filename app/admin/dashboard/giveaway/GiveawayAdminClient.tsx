"use client";

import { useMemo, useState } from "react";

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
  giveaway_status: string | null;
  duplicate_flag: boolean | null;
  duplicate_reason: string | null;
  usually_go_out_area: string | null;
  giveaway_notes: string | null;
  created_at: string | null;
  giveaway_verified_at: string | null;
  beta_interest?: boolean | null; beta_application_status?: string | null; age_18_confirmed?: boolean | null; giveaway_rules_agreed?: boolean | null; weekly_task_eligibility_status?: string | null; beta_giveaway_eligibility?: { isBetaTester: boolean; betaStatus: string | null; completedThisWeek: number; requiredThisWeek: number; weeklyTasksComplete: boolean; eligibilityStatus: string; reason: string; } | null;
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

const tableColumns = [
  "Entrant",
  "Contact",
  "Social",
  "Checks",
  "Status",
  "Timing",
  "Notes",
  "Actions",
];

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

  function renderActions(entry: Entry, compact = false) {
    const isBusy = busyEntryId === entry.id;
    return (
      <div
        className={
          compact ? "grid grid-cols-2 gap-2" : "flex min-w-48 flex-col gap-2"
        }
      >
        <button disabled={isBusy} onClick={() => patchEntry(entry, { action: "approve_beta" })} className={`${actionButtonClass} bg-emerald-700 text-white`}>Approve as Beta User</button>
        <button disabled={isBusy} onClick={() => patchEntry(entry, { action: "reject_beta", rejection_reason: "Admin rejected" })} className={`${actionButtonClass} border border-red-300/30 bg-red-500/10 text-red-100`}>Reject Beta</button>
        <button disabled={isBusy} onClick={() => patchEntry(entry, { action: "verify_social" })} className={`${actionButtonClass} border border-white/10 bg-white/[0.08] text-white`}>Verify follow</button>
        <button disabled={isBusy} onClick={() => patchEntry(entry, { action: "verify_tags" })} className={`${actionButtonClass} border border-white/10 bg-white/[0.08] text-white`}>Verify tags</button>
        <button disabled={isBusy} onClick={() => patchEntry(entry, { giveaway_status: "pending_beta_tasks" })} className={`${actionButtonClass} border border-amber-300/20 bg-amber-500/10 text-amber-100`}>Pending beta tasks</button>
        {entry.wants_giveaway ? (
          <button
            disabled={isBusy}
            onClick={() => patchEntry(entry, { giveaway_status: "verified" })}
            className={`${actionButtonClass} bg-emerald-500 text-white`}
          >
            Verify
          </button>
        ) : null}
        <button
          disabled={isBusy}
          onClick={() => patchEntry(entry, { giveaway_status: "disqualified" })}
          className={`${actionButtonClass} bg-red-600 text-white`}
        >
          Disqualify
        </button>
        {entry.wants_giveaway ? (
          <button
            disabled={isBusy}
            onClick={() => patchEntry(entry, { giveaway_status: "winner" })}
            className={`${actionButtonClass} bg-amber-400 text-black`}
          >
            Reward Winner
          </button>
        ) : null}
        <button
          disabled={isBusy}
          onClick={() => patchEntry(entry, { giveaway_status: "alternate" })}
          className={`${actionButtonClass} bg-sky-600 text-white`}
        >
          Alternate
        </button>
        <button
          disabled={isBusy}
          onClick={() =>
            patchEntry(entry, { giveaway_status: "pending_verification" })
          }
          className={`${actionButtonClass} border border-white/10 bg-white/[0.08] text-white`}
        >
          Reset
        </button>
        <button
          disabled={isBusy}
          onClick={() =>
            patchEntry(entry, { duplicate_flag: false, duplicate_reason: "" })
          }
          className={`${actionButtonClass} border border-white/10 bg-white/[0.08] text-white`}
        >
          Clear duplicate
        </button>
        <button
          disabled={isBusy}
          onClick={() =>
            patchEntry(entry, {
              duplicate_flag: true,
              duplicate_reason: "Admin marked for review",
            })
          }
          className={`${actionButtonClass} bg-rose-700 text-white`}
        >
          Flag duplicate
        </button>
        {deleteConfirmId === entry.id ? (
          <div
            className={
              compact
                ? "col-span-2 rounded-2xl border border-red-300/25 bg-red-950/30 p-2"
                : "rounded-2xl border border-red-300/25 bg-red-950/30 p-2"
            }
          >
            <p className="text-[11px] font-bold leading-4 text-red-100">
              Delete this entry permanently?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                disabled={isBusy}
                onClick={() => deleteEntry(entry)}
                className="flex-1 rounded-full bg-red-600 px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50"
              >
                {isBusy ? "Deleting..." : "Confirm"}
              </button>
              <button
                disabled={isBusy}
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            disabled={isBusy}
            onClick={() => setDeleteConfirmId(entry.id)}
            className={`${actionButtonClass} border border-red-300/30 bg-red-500/10 text-red-100`}
          >
            Delete
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
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

      <section className="hidden overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/20 md:block">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white/70">
              Entries
            </h2>
            <p className="mt-1 text-xs text-white/35">
              Compact desktop view. Scroll sideways for admin actions.
            </p>
          </div>
          {isLoading ? (
            <span className="rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-black text-rose-100">
              Refreshing...
            </span>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1500px] text-left text-xs text-white/70">
            <thead className="bg-white/[0.06] text-[10px] uppercase tracking-[0.16em] text-white/45">
              <tr>
                {tableColumns.map((head) => (
                  <th key={head} className="px-3 py-3 font-black">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-t border-white/10 align-top transition hover:bg-white/[0.03]"
                >
                  <td className="w-56 px-3 py-3">
                    <p className="font-black text-white">
                      {formatText(entry.full_name)}
                    </p>
                    <p className="mt-1 text-white/35">ID {entry.id}</p>
                    <p className="mt-2 rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/55">{entry.wants_giveaway ? "Giveaway" : "Launch List"}</p><p className="mt-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100">Beta: {entry.beta_application_status || (entry.beta_interest ? "new" : "none")}</p>
                  </td>
                  <td className="w-64 px-3 py-3">
                    <p className="font-bold text-white/85">
                      {formatText(entry.email)}
                    </p>
                    <p className="mt-1 text-white/50">
                      {formatText(entry.phone)}
                    </p>
                    <p className="mt-2 text-[11px] text-white/40">
                      Marketing: {yesNo(entry.marketing_consent)}
                    </p>
                  </td>
                  <td className="w-48 px-3 py-3">
                    <p className="font-bold text-white/85">
                      {formatText(entry.social_handle)}
                    </p>
                    <p className="mt-1 capitalize text-white/45">
                      {formatText(entry.social_platform)}
                    </p>
                    <p className="mt-2 text-[11px] text-white/40">
                      Area: {formatText(entry.usually_go_out_area)}
                    </p>
                  </td>
                  <td className="w-56 px-3 py-3">
                    <p>
                      Email verified:{" "}
                      <span className="font-bold text-white">
                        {yesNo(entry.email_verified)}
                      </span>
                    </p>
                    <p className="mt-1">
                      Followed:{" "}
                      <span className="font-bold text-white">
                        {yesNo(entry.followed_social)}
                      </span>
                    </p>
                    <p className="mt-1">
                      Tagged friends:{" "}
                      <span className="font-bold text-white">
                        {yesNo(entry.tagged_two_friends)}
                      </span>
                    </p>
                    <p className="mt-1">
                      Duplicate:{" "}
                      <span className="font-bold text-white">
                        {yesNo(entry.duplicate_flag)}
                      </span>
                    </p>
                    <p className="mt-1">
                      18+ confirmed: <span className="font-bold text-white">{yesNo(entry.age_18_confirmed)}</span>
                    </p>
                    <p className="mt-1">
                      Rules agreed: <span className="font-bold text-white">{yesNo(entry.giveaway_rules_agreed)}</span>
                    </p>
                    <p className="mt-1">
                      Weekly beta tasks: <span className="font-bold text-white">{entry.beta_giveaway_eligibility?.isBetaTester ? `${entry.beta_giveaway_eligibility.completedThisWeek} / ${entry.beta_giveaway_eligibility.requiredThisWeek} completed` : "Not approved as beta yet"}</span>
                    </p>
                    {entry.duplicate_reason ? (
                      <p className="mt-2 text-red-100/80">
                        {entry.duplicate_reason}
                      </p>
                    ) : null}
                  </td>
                  <td className="w-44 px-3 py-3">
                    <StatusBadge status={entry.giveaway_status} />
                  </td>
                  <td className="w-48 px-3 py-3">
                    <p>Created: {formatDate(entry.created_at)}</p>
                    <p className="mt-1">
                      Email: {formatDate(entry.email_verified_at)}
                    </p>
                    <p className="mt-1">
                      Prize Qualified: {formatDate(entry.giveaway_verified_at)}
                    </p>
                    <p className="mt-1">
                      Consent: {formatDate(entry.marketing_consent_at)}
                    </p>
                  </td>
                  <td className="w-64 px-3 py-3">
                    <textarea
                      defaultValue={entry.giveaway_notes || ""}
                      onBlur={(event) =>
                        patchEntry(entry, {
                          giveaway_notes: event.target.value,
                        })
                      }
                      placeholder="Admin notes"
                      className="h-24 w-60 rounded-2xl border border-white/10 bg-black/20 p-3 text-white outline-none placeholder:text-white/30 focus:border-rose-300/50"
                    />
                  </td>
                  <td className="px-3 py-3">{renderActions(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!entries.length ? (
          <p className="border-t border-white/10 px-4 py-8 text-center text-sm font-bold text-white/45">
            No entries match this view.
          </p>
        ) : null}
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
              <p className="mt-1">Weekly beta tasks: <span className="font-black text-white">{entry.beta_giveaway_eligibility?.isBetaTester ? `${entry.beta_giveaway_eligibility.completedThisWeek} / ${entry.beta_giveaway_eligibility.requiredThisWeek} completed` : "Not approved as beta yet"}</span></p>
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
            <div className="mt-4">{renderActions(entry, true)}</div>
          </article>
        ))}
        {!entries.length ? (
          <p className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-8 text-center text-sm font-bold text-white/45">
            No entries match this view.
          </p>
        ) : null}
      </section>

      {duplicateEvents.length ? (
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
