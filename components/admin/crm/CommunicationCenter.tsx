"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Mail, MessageSquareText, Phone, RefreshCw, ShieldCheck, UserRound } from "lucide-react";

type FeedItem = {
  id: string;
  locationId: string | null;
  locationName: string | null;
  channel: string;
  direction: string | null;
  title: string;
  preview: string;
  status: string | null;
  unread: boolean;
  timestamp: string;
  href: string;
};

type FeedPayload = {
  items: FeedItem[];
  unreadCount: number;
  waitingCount: number;
};

function iconFor(channel: string) {
  const value = channel.toLowerCase();
  if (value.includes("sms") || value.includes("text")) return MessageSquareText;
  if (value.includes("email")) return Mail;
  if (value.includes("call") || value.includes("phone")) return Phone;
  if (value.includes("claim")) return ShieldCheck;
  return UserRound;
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function titleCase(value: string | null | undefined) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CommunicationCenter() {
  const [data, setData] = useState<FeedPayload>({ items: [], unreadCount: 0, waitingCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/crm/communication-center", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load communications.");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load communications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return data.items;
    if (filter === "unread") return data.items.filter((item) => item.unread);
    if (filter === "sms") return data.items.filter((item) => ["sms", "text"].some((value) => item.channel.toLowerCase().includes(value)));
    if (filter === "email") return data.items.filter((item) => item.channel.toLowerCase().includes("email"));
    if (filter === "calls") return data.items.filter((item) => ["call", "phone"].some((value) => item.channel.toLowerCase().includes(value)));
    return data.items;
  }, [data.items, filter]);

  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-white/10 bg-[#0e0e11] shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-rose-300" />
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300">Communication Center</p>
          </div>
          <h2 className="mt-1 text-2xl font-black text-white">Your customer conversations</h2>
          <p className="mt-1 text-sm text-zinc-400">Texts, emails, calls, claim invitations, and follow-ups in one feed.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-zinc-300">
            <span className="text-white">{data.unreadCount}</span> unread
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-zinc-300">
            <span className="text-white">{data.waitingCount}</span> need attention
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border border-white/10 p-2.5 text-zinc-400 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50" aria-label="Refresh communications">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Link href="/admin/dashboard/crm/outreach" className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-rose-500">
            Open Communications
          </Link>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-white/[0.07] px-4 py-3">
        {[
          ["all", "All"],
          ["unread", "Unread"],
          ["sms", "Texts"],
          ["email", "Email"],
          ["calls", "Calls"],
        ].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-black transition ${filter === value ? "bg-white text-black" : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="p-5 text-sm font-bold text-red-200">{error}</div>
      ) : loading && data.items.length === 0 ? (
        <div className="p-5 text-sm text-zinc-500">Loading recent conversations…</div>
      ) : filtered.length === 0 ? (
        <div className="p-5 text-sm text-zinc-500">No communications match this view yet.</div>
      ) : (
        <div className="max-h-[520px] divide-y divide-white/[0.07] overflow-y-auto">
          {filtered.map((item) => {
            const Icon = iconFor(item.channel);
            return (
              <Link key={item.id} href={item.href} className={`grid gap-3 p-4 transition hover:bg-white/[0.035] sm:grid-cols-[44px_minmax(0,1fr)_auto] ${item.unread ? "bg-rose-500/[0.055]" : ""}`}>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-zinc-300">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    {item.unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" /> : null}
                    <p className="truncate text-sm font-black text-white">{item.locationName || item.title}</p>
                    <span className="shrink-0 rounded-md bg-white/[0.06] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">{titleCase(item.channel)}</span>
                  </div>
                  {item.locationName ? <p className="mt-1 truncate text-xs font-bold text-zinc-300">{item.title}</p> : null}
                  {item.preview ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-500">{item.preview}</p> : null}
                </div>
                <div className="flex items-start justify-between gap-3 sm:block sm:text-right">
                  <p className="text-xs font-bold text-zinc-500">{timeLabel(item.timestamp)}</p>
                  <div className="mt-1 flex items-center gap-1 sm:justify-end">
                    {item.direction ? <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-600">{item.direction}</span> : null}
                    {item.status ? <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-600">· {titleCase(item.status)}</span> : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
