"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Log = {
  id: string;
  channel?: string;
  subject?: string | null;
  body?: string | null;
  message?: string | null;
  to_address?: string | null;
  status?: string | null;
  delivery_status?: string | null;
  direction?: string | null;
  created_at?: string | null;
  sent_at?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function CrmEmailComposer({
  locationId,
  defaultEmail,
  canSend,
  logs,
}: {
  locationId: string;
  defaultEmail?: string | null;
  canSend: boolean;
  logs: Log[];
}) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const emailLogs = logs.filter((log) => String(log.channel || "").toLowerCase() === "email");

  async function sendEmail() {
    if (!canSend || sending) return;
    setNotice(null);
    if (!defaultEmail) {
      setNotice({ type: "error", text: "Add an owner email to this location before sending." });
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setNotice({ type: "error", text: "Enter a subject and message." });
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/admin/crm/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, subject, body }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "The email could not be sent.");

      setSubject("");
      setBody("");
      setNotice({ type: "success", text: `Email sent to ${defaultEmail} and recorded on this location.` });
      router.refresh();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "The email could not be sent." });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-lg font-black">Email Composer</h3>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-bold">
            To
            <input value={defaultEmail || "No owner email on file"} readOnly className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white/70" />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Subject
            <input value={subject} onChange={(event) => setSubject(event.target.value)} disabled={!canSend || sending || !defaultEmail} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 disabled:opacity-50" />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Message
            <textarea rows={9} value={body} onChange={(event) => setBody(event.target.value)} disabled={!canSend || sending || !defaultEmail} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 disabled:opacity-50" />
          </label>
          {notice ? (
            <div role="status" className={`rounded-2xl border p-3 text-sm ${notice.type === "success" ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-100" : "border-rose-300/30 bg-rose-500/10 text-rose-100"}`}>
              {notice.text}
            </div>
          ) : null}
          <button
            type="button"
            onClick={sendEmail}
            disabled={!canSend || sending || !defaultEmail || !subject.trim() || !body.trim()}
            className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send email"}
          </button>
          <p className="text-xs leading-5 text-white/45">This sends only to the owner email stored on the selected location and records the delivery in that location's CRM history.</p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-lg font-black">Email History</h3>
        {emailLogs.length ? (
          <div className="mt-4 space-y-3">
            {emailLogs.map((log) => (
              <article key={log.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-white/45">{log.direction || "outbound"} · {log.delivery_status || log.status || "sent"}</p>
                <p className="mt-2 font-black">{log.subject || "Email"}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-white/65">{log.body || log.message || "No body stored."}</p>
                <p className="mt-2 text-xs text-white/40">{formatDate(log.sent_at || log.created_at)}{log.to_address ? ` · ${log.to_address}` : ""}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-5 text-sm text-white/55">No email history is available for this location yet.</p>
        )}
      </section>
    </section>
  );
}
