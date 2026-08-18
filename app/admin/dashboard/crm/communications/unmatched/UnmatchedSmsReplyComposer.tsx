"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  conversationId: string;
  phone: string;
};

export default function UnmatchedSmsReplyComposer({ conversationId, phone }: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function sendReply() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/crm/sms/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, body: text }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not send SMS reply.");
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send SMS reply.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-white/10 bg-white/[0.025] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-black uppercase tracking-[0.14em] text-rose-200">Reply from 516-200-0811</span>
        <span className="text-white/45">To {phone}</span>
      </div>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        maxLength={1600}
        placeholder="Reply to this conversation…"
        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-rose-400/50"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          {error ? <p className="text-xs font-bold text-red-200">{error}</p> : <p className="text-xs text-white/35">{body.length}/1600 · replies stay in this CRM thread</p>}
        </div>
        <button
          type="button"
          onClick={sendReply}
          disabled={sending || !body.trim()}
          className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send reply"}
        </button>
      </div>
    </div>
  );
}
