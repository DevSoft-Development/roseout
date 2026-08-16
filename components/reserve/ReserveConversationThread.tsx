"use client";

import { useEffect, useState } from "react";

type Message = {
  id: string;
  direction: string;
  channel: string;
  body_text?: string | null;
  subject?: string | null;
  status?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  created_at?: string | null;
};

type ThreadPayload = {
  conversation: Record<string, any> | null;
  messages: Message[];
};

function formatMessageTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ReserveConversationThread({
  reservation,
  refreshKey = 0,
  onRead,
}: {
  reservation: any;
  refreshKey?: number;
  onRead?: () => void;
}) {
  const [thread, setThread] = useState<ThreadPayload>({ conversation: null, messages: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          reservation_id: reservation.id,
          location_id: reservation.location_id,
          mark_read: "1",
        });
        const response = await fetch(`/api/reserve/portal/reservations/message?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Conversation could not be loaded.");
        if (!cancelled) {
          setThread({ conversation: data.conversation || null, messages: data.messages || [] });
          onRead?.();
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Conversation could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [reservation.id, reservation.location_id, refreshKey, onRead]);

  return (
    <div className="reserve-soft mt-3 rounded-2xl p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-white/70">Conversation</p>
          <p className="mt-0.5 text-[11px] reserve-muted">SMS and email replies stay with this reservation.</p>
        </div>
        {thread.conversation?.status === "waiting_on_team" ? (
          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-300">Reply needed</span>
        ) : null}
      </div>

      {loading ? <p className="mt-3 text-xs reserve-muted">Loading conversation…</p> : null}
      {error ? <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-2 text-xs font-bold text-rose-200">{error}</p> : null}
      {!loading && !error && !thread.messages.length ? (
        <p className="mt-3 text-xs reserve-muted">No messages in this reservation conversation yet.</p>
      ) : null}

      {thread.messages.length ? (
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
          {thread.messages.map((message) => {
            const inbound = message.direction === "inbound";
            const label = inbound ? "Guest" : message.direction === "system" ? "System" : "Team";
            return (
              <div key={message.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[88%] rounded-2xl border px-3 py-2 text-xs ${inbound ? "border-white/10 bg-white/[0.06]" : "border-[var(--reserve-primary)]/25 bg-[var(--reserve-primary)]/10"}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-black uppercase tracking-[0.08em] opacity-70">
                    <span>{label}</span>
                    <span>·</span>
                    <span>{String(message.channel || "message").toUpperCase()}</span>
                    {formatMessageTime(message.created_at || message.sent_at) ? <><span>·</span><span>{formatMessageTime(message.created_at || message.sent_at)}</span></> : null}
                  </div>
                  {message.subject ? <p className="mt-1 font-black">{message.subject}</p> : null}
                  <p className="mt-1 whitespace-pre-wrap leading-5 text-white/90">{message.body_text || "(No message text)"}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
