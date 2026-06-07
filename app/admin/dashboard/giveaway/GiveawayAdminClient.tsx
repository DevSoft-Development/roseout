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
  ["launch_list_only", "Launch List only"],
  ["giveaway_entries", "Giveaway entries only"],
  ["email_unverified", "Email unverified"],
  ["pending_verification", "Pending verification"],
  ["verified", "Verified"],
  ["disqualified", "Disqualified"],
  ["winner", "Winner"],
  ["alternate", "Alternate"],
  ["missing_social_handle", "Missing social handle"],
  ["duplicate_flagged", "Duplicate flagged"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["both", "Both"],
  ["followed_self_reported", "Followed self-reported"],
  ["tagged_self_reported", "Tagged self-reported"],
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
  "giveaway_status",
  "duplicate_flag",
  "duplicate_reason",
  "usually_go_out_area",
  "giveaway_notes",
  "created_at",
  "giveaway_verified_at",
] as const;

function escapeCsv(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function GiveawayAdminClient({ initialEntries, initialStats, duplicateEvents }: { initialEntries: Entry[]; initialStats: Stats; duplicateEvents: DuplicateEvent[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [stats, setStats] = useState(initialStats);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const statCards = useMemo(() => [
    ["Total signups", stats.total],
    ["Launch List only", stats.launchListOnly],
    ["Giveaway entries", stats.giveawayEntries],
    ["Email unverified", stats.emailUnverified],
    ["Pending verification", stats.pendingVerification],
    ["Verified entries", stats.verifiedEntries],
    ["Missing social handle", stats.missingSocialHandle],
    ["Duplicate flagged", stats.duplicateFlagged],
    ["Winner selected", stats.winnerSelected],
  ], [stats]);

  async function loadEntries(nextFilter = filter, nextSearch = search) {
    const params = new URLSearchParams({ filter: nextFilter, search: nextSearch });
    const response = await fetch(`/api/admin/giveaway/entries?${params.toString()}`);
    const payload = await response.json();
    if (payload.success) {
      setEntries(payload.entries || []);
      setStats(payload.stats || stats);
    }
  }

  async function patchEntry(entry: Entry, updates: Record<string, unknown>) {
    setMessage("");
    const response = await fetch(`/api/admin/giveaway/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || "Update failed");
      return;
    }
    setEntries((current) => current.map((item) => (item.id === entry.id ? payload.entry : item)));
    setMessage("Entry updated.");
  }

  function exportCsv() {
    const csv = [csvColumns.join(","), ...entries.map((entry) => csvColumns.map((column) => escapeCsv(entry[column])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "theouthaven-launch-giveaway.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-9">
        {statCards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50">{label}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
        <p className="text-sm leading-6 text-white/70">Users are not fully entered until their email is verified. Social follow and tag checkboxes are self-reported. Use the submitted social handle to check the giveaway post comments. Verify that the user followed @TheOutHaven and tagged 2 friends in the giveaway post comments before marking the entry verified. Duplicate emails update the existing signup. Duplicate social handles across different emails should be reviewed or blocked.</p>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4 lg:flex-row lg:items-center">
        <select value={filter} onChange={(event) => { setFilter(event.target.value); loadEntries(event.target.value, search); }} className="rounded-2xl border border-white/10 bg-[#140807] px-4 py-3 text-sm font-bold text-white">
          {filters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") loadEntries(filter, search); }} placeholder="Search full_name, email, social_handle, phone" className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/35" />
        <button onClick={() => loadEntries(filter, search)} className="rounded-full bg-white px-5 py-3 text-sm font-black text-[#120606]">Search</button>
        <button onClick={exportCsv} className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-3 text-sm font-black text-white">Export CSV</button>
      </section>
      {message ? <p className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm font-bold text-rose-50">{message}</p> : null}

      <section className="overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.04]">
        <table className="min-w-[2200px] text-left text-xs text-white/70">
          <thead className="bg-white/[0.06] text-[10px] uppercase tracking-[0.18em] text-white/45">
            <tr>{["Name","Email","Phone","Wants giveaway","Social handle","Platform","Email verified","Email verified at","Consent accepted","Consent timestamp","Followed social self-report","Tagged 2 friends self-report","Giveaway status","Duplicate flag","Duplicate reason","Usually goes out area","Created at","Verified at","Notes","Actions"].map((head) => <th key={head} className="px-3 py-3">{head}</th>)}</tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-white/10 align-top">
                <td className="px-3 py-3 font-bold text-white">{entry.full_name}</td>
                <td className="px-3 py-3">{entry.email}</td>
                <td className="px-3 py-3">{entry.phone}</td>
                <td className="px-3 py-3">{entry.wants_giveaway ? "Yes" : "No"}</td>
                <td className="px-3 py-3">{entry.social_handle}</td>
                <td className="px-3 py-3">{entry.social_platform}</td>
                <td className="px-3 py-3">{entry.email_verified ? "Yes" : "No"}</td>
                <td className="px-3 py-3">{entry.email_verified_at}</td>
                <td className="px-3 py-3">{entry.marketing_consent ? "Yes" : "No"}</td>
                <td className="px-3 py-3">{entry.marketing_consent_at}</td>
                <td className="px-3 py-3">{entry.followed_social ? "Yes" : "No"}</td>
                <td className="px-3 py-3">{entry.tagged_two_friends ? "Yes" : "No"}</td>
                <td className="px-3 py-3 font-bold text-white">{entry.giveaway_status}</td>
                <td className="px-3 py-3">{entry.duplicate_flag ? "Yes" : "No"}</td>
                <td className="px-3 py-3">{entry.duplicate_reason}</td>
                <td className="px-3 py-3">{entry.usually_go_out_area}</td>
                <td className="px-3 py-3">{entry.created_at}</td>
                <td className="px-3 py-3">{entry.giveaway_verified_at}</td>
                <td className="px-3 py-3"><textarea defaultValue={entry.giveaway_notes || ""} onBlur={(event) => patchEntry(entry, { giveaway_notes: event.target.value })} className="h-24 w-56 rounded-xl border border-white/10 bg-black/20 p-2 text-white" /></td>
                <td className="space-y-2 px-3 py-3">
                  {entry.wants_giveaway ? <button onClick={() => patchEntry(entry, { giveaway_status: "verified" })} className="block rounded-full bg-emerald-500 px-3 py-1 font-black text-white">Mark Verified</button> : null}
                  <button onClick={() => patchEntry(entry, { giveaway_status: "disqualified" })} className="block rounded-full bg-red-600 px-3 py-1 font-black text-white">Mark Disqualified</button>
                  {entry.wants_giveaway ? <button onClick={() => patchEntry(entry, { giveaway_status: "winner" })} className="block rounded-full bg-yellow-500 px-3 py-1 font-black text-black">Mark Winner</button> : null}
                  <button onClick={() => patchEntry(entry, { giveaway_status: "alternate" })} className="block rounded-full bg-sky-600 px-3 py-1 font-black text-white">Mark Alternate</button>
                  <button onClick={() => patchEntry(entry, { giveaway_status: "pending_verification" })} className="block rounded-full bg-white/10 px-3 py-1 font-black text-white">Reset to Pending</button>
                  <button onClick={() => patchEntry(entry, { duplicate_flag: false, duplicate_reason: "" })} className="block rounded-full bg-white/10 px-3 py-1 font-black text-white">Clear Duplicate Flag</button>
                  <button onClick={() => patchEntry(entry, { duplicate_flag: true, duplicate_reason: "Admin marked for review" })} className="block rounded-full bg-rose-600 px-3 py-1 font-black text-white">Mark Duplicate Flag</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {duplicateEvents.length ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-xl font-black">Duplicate audit events</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1000px] text-left text-xs text-white/65">
              <thead><tr>{["attempted_email","attempted_social_handle","attempted_social_platform","conflict_type","created_at","ip_address","user_agent"].map((head) => <th key={head} className="px-3 py-2">{head}</th>)}</tr></thead>
              <tbody>{duplicateEvents.map((event) => <tr key={event.id} className="border-t border-white/10"><td className="px-3 py-2">{event.attempted_email}</td><td className="px-3 py-2">{event.attempted_social_handle}</td><td className="px-3 py-2">{event.attempted_social_platform}</td><td className="px-3 py-2">{event.conflict_type}</td><td className="px-3 py-2">{event.created_at}</td><td className="px-3 py-2">{event.ip_address}</td><td className="px-3 py-2">{event.user_agent}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
