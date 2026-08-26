"use client";

import { useEffect, useRef, useState } from "react";

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

function channelLabel(value: unknown) {
  const channel = String(value || "").toLowerCase();
  if (channel === "sms") return "Text";
  if (channel === "email") return "Email";
  return "Message";
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
  const [thread, setThread] = useState<ThreadPayload>({
    conversation: null,
    messages: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const onReadRef = useRef(onRead);

  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);

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
        const response = await fetch(
          `/api/reserve/portal/reservations/message?${params.toString()}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "We could not load messages for this guest.");
        }
        if (!cancelled) {
          setThread({
            conversation: data.conversation || null,
            messages: data.messages || [],
          });
          onReadRef.current?.();
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "We could not load messages for this guest.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [reservation.id, reservation.location_id, refreshKey]);

  return (
    <div className="reserve-soft mt-3 rounded-2xl p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-white/70">
            Guest messages
          </p>
          <p className="mt-0.5 text-[11px] reserve-muted">
            Text and email replies stay with this reservation.
          </p>
        </div>
        {thread.conversation?.status === "waiting_on_team" ? (
          <span className="rounded-full border border-[#e1062a]/25 bg-[#e1062a]/10 px-2 py-1 text-[10px] font-black text-[#ff8aa0]">
            Reply needed
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-3 text-xs reserve-muted">Loading messages…</p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-2 text-xs font-bold text-rose-200">
          {error}
        </p>
      ) : null}
      {!loading && !error && !thread.messages.length ? (
        <p className="mt-3 text-xs reserve-muted">
          No messages have been sent for this reservation yet.
        </p>
      ) : null}

      {thread.messages.length ? (
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
          {thread.messages.map((message) => {
            const inbound = message.direction === "inbound";
            const label =
              message.direction === "system" ? "TheOutHaven" : inbound ? "Guest" : "Team";
            const messageTime = formatMessageTime(
              message.created_at || message.sent_at,
            );

            return (
              <div
                key={message.id}
                className={`flex ${inbound ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl border px-3 py-2 text-xs ${
                    inbound
                      ? "border-white/10 bg-white/[0.06]"
                      : "border-[var(--reserve-primary)]/25 bg-[var(--reserve-primary)]/10"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-black uppercase tracking-[0.08em] opacity-70">
                    <span>{label}</span>
                    <span>·</span>
                    <span>{channelLabel(message.channel)}</span>
                    {messageTime ? (
                      <>
                        <span>·</span>
                        <span>{messageTime}</span>
                      </>
                    ) : null}
                  </div>
                  {message.subject ? (
                    <p className="mt-1 font-black">{message.subject}</p>
                  ) : null}
                  <p className="mt-1 whitespace-pre-wrap leading-5 text-white/90">
                    {message.body_text || "No message text"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
