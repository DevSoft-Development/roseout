"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CRM_MAIN_NUMBER_DISPLAY = "516-200-0811";

type Log = {
  id: string;
  channel?: string;
  body?: string | null;
  message?: string | null;
  to_address?: string | null;
  recipient?: string | null;
  status?: string | null;
  delivery_status?: string | null;
  direction?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  failure_reason?: string | null;
  created_at?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function CrmSmsComposer({
  locationId,
  defaultPhone,
  canSend,
  logs,
}: {
  locationId: string;
  defaultPhone?: string | null;
  canSend: boolean;
  logs: Log[];
}) {
  const router = useRouter();
  const [to, setTo] = useState(defaultPhone || "");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const smsLogs = logs.filter((log) => String(log.channel || "").toLowerCase() === "sms");
  const segments = Math.max(1, Math.ceil(body.length / 160));

  async function sendSms() {
    if (!canSend || sending) return;
    setNotice(null);

    if (!to.trim() || !body.trim()) {
      setNotice({ type: "error", text: "Enter a recipient phone number and message." });
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/admin/crm/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, to, body }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "The text message could not be sent.");
      }

      setBody("");
      setNotice({
        type: "success",
        text: `Text queued from ${CRM_MAIN_NUMBER_DISPLAY}. Replies will return to this CRM conversation.`,
      });
      router.refresh();
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "The text message could not be sent.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-lg font-black">SMS Composer</h3>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-bold">
            From
            <input
              value={CRM_MAIN_NUMBER_DISPLAY}
              readOnly
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white/70"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            To
            <input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="(516) 555-0123"
              inputMode="tel"
              disabled={!canSend || sending}
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 disabled:opacity-50"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Message
            <textarea
              rows={8}
              maxLength={1600}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Type a customer-care or sales follow-up text."
              disabled={!canSend || sending}
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 disabled:opacity-50"
            />
          </label>
          <p className="text-xs text-white/55">
            {body.length}/1600 characters · {segments} estimated segment{segments === 1 ? "" : "s"}. The server blocks contacts marked opted out or do-not-contact.
          </p>
          {notice ? (
            <div
              role="status"
              className={`rounded-2xl border p-3 text-sm ${notice.type === "success" ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-100" : "border-rose-300/30 bg-rose-500/10 text-rose-100"}`}
            >
              {notice.text}
            </div>
          ) : null}
          <button
            type="button"
            onClick={sendSms}
            disabled={!canSend || sending || !to.trim() || !body.trim()}
            className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? "Sending…" : `Send from ${CRM_MAIN_NUMBER_DISPLAY}`}
          </button>
          <p className="text-xs leading-5 text-white/45">
            Sending is manual. Delivery receipts and inbound replies are recorded through the verified Telnyx webhook.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black">Two-way SMS History</h3>
            <p className="mt-1 text-sm text-white/50">Inbound and outbound Telnyx messages for this location appear here.</p>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-2 text-xs font-black text-white/60">
            Main line · {CRM_MAIN_NUMBER_DISPLAY}
          </span>
        </div>
        {smsLogs.length ? (
          <div className="mt-4 space-y-3">
            {smsLogs
              .slice()
              .sort((a, b) => new Date(a.created_at || a.sent_at || 0).getTime() - new Date(b.created_at || b.sent_at || 0).getTime())
              .map((log) => (
                <article
                  key={log.id}
                  className={`max-w-[85%] rounded-2xl border p-4 ${log.direction === "inbound" ? "mr-auto border-white/10 bg-black/25" : "ml-auto border-rose-300/20 bg-rose-500/10"}`}
                >
                  <p className="text-xs font-black uppercase tracking-widest text-white/45">
                    {log.direction === "inbound" ? "Inbound" : "Outbound"} · {log.delivery_status || log.status || "pending"}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/75">
                    {log.body || log.message || "No message body stored."}
                  </p>
                  <p className="mt-2 text-xs text-white/40">
                    {formatDate(log.sent_at || log.created_at)}
                    {log.delivered_at ? ` · Delivered ${formatDate(log.delivered_at)}` : ""}
                  </p>
                  {log.failure_reason ? <p className="mt-2 text-xs text-rose-200">{log.failure_reason}</p> : null}
                </article>
              ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-5 text-sm text-white/60">
            <b className="block text-white">No SMS conversation yet</b>
            <p className="mt-1">Send the first text from the main number. Future replies will be attached to the CRM thread.</p>
          </div>
        )}
      </section>
    </section>
  );
}
