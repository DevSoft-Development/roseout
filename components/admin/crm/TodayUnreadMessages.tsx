"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Mail, MessageSquareText, Phone } from "lucide-react";

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
  if (value.includes("email")) return Mail;
  if (value.includes("call") || value.includes("phone")) return Phone;
  return MessageSquareText;
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

export default function TodayUnreadMessages() {
  const [data, setData] = useState<FeedPayload>({ items: [], unreadCount: 0, waitingCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/crm/communication-center?scope=crm", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not load unread messages.");
        setData(payload);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setError(err instanceof Error ? err.message : "Could not load unread messages.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const unread = useMemo(() => data.items.filter((item) => item.unread).slice(0, 6), [data.items]);

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0e0e11]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300">Inbox</p>
          <h2 className="mt-1 text-xl font-black text-white">Unread messages</h2>
          <p className="mt-1 text-sm text-zinc-500">{data.unreadCount} unread · {data.waitingCount} need attention</p>
        </div>
        <Link href="/admin/dashboard/crm/outreach" className="rounded-xl border border-white/10 px-3 py-2 text-sm font-black text-white/80 hover:bg-white/[0.05]">
          Open Communications
        </Link>
      </div>

      {error ? (
        <p className="p-5 text-sm font-bold text-red-200">{error}</p>
      ) : loading ? (
        <p className="p-5 text-sm text-zinc-500">Loading unread messages…</p>
      ) : unread.length === 0 ? (
        <p className="p-5 text-sm text-zinc-500">No unread CRM messages right now.</p>
      ) : (
        <div className="divide-y divide-white/[0.07]">
          {unread.map((item) => {
            const Icon = iconFor(item.channel);
            return (
              <Link key={item.id} href={item.href} className="grid gap-3 bg-rose-500/[0.035] p-4 transition hover:bg-white/[0.04] sm:grid-cols-[40px_minmax(0,1fr)_auto]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-zinc-300">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                    <p className="truncate text-sm font-black text-white">{item.locationName || item.title}</p>
                  </div>
                  {item.locationName ? <p className="mt-1 truncate text-xs font-bold text-zinc-300">{item.title}</p> : null}
                  {item.preview ? <p className="mt-1 line-clamp-1 text-sm text-zinc-500">{item.preview}</p> : null}
                </div>
                <p className="text-xs font-bold text-zinc-500">{timeLabel(item.timestamp)}</p>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
