"use client";

import { useState } from "react";
import { Mail, MessageSquareText, ShieldCheck, X } from "lucide-react";

type Channel = "email" | "sms";

export default function ClaimCodeSendAction({
  locationId,
}: {
  locationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>("email");
  const [recipient, setRecipient] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function send() {
    setSending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/workspace/claim-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          channel,
          recipient: recipient.trim() || undefined,
          notes: notes.trim() || undefined,
          platform: "crm",
        }),
      });

      const raw = await response.text();
      let payload: { error?: string; success?: boolean } = {};
      if (raw) {
        try {
          payload = JSON.parse(raw) as { error?: string; success?: boolean };
        } catch {
          payload = {};
        }
      }

      if (!response.ok) {
        throw new Error(payload.error || `Claim invitation failed (${response.status}).`);
      }

      setMessage(`Claim invitation sent by ${channel === "sms" ? "text" : "email"}.`);
      setRecipient("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send claim code.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMessage("");
          setError("");
        }}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-500"
      >
        <ShieldCheck className="h-4 w-4" />
        Send Claim Code
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#111114] p-5 shadow-2xl shadow-black/70">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300">Claim invitation</p>
                <h2 className="mt-1 text-2xl font-black text-white">Send Claim Code</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Send this location a secure claim invitation. The code and direct claim link are generated automatically and the send is logged in CRM activity.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-black/30 p-1.5">
              <button type="button" onClick={() => setChannel("email")} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition ${channel === "email" ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}>
                <Mail className="h-4 w-4" /> Email
              </button>
              <button type="button" onClick={() => setChannel("sms")} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition ${channel === "sms" ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}>
                <MessageSquareText className="h-4 w-4" /> Text
              </button>
            </div>

            <label className="mt-5 block text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
              {channel === "email" ? "Email address" : "Mobile number"}
              <input
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder={channel === "email" ? "Leave blank to use the saved business email" : "Leave blank to use the saved business phone"}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-white outline-none placeholder:text-zinc-600 focus:border-rose-400/50"
              />
            </label>

            <label className="mt-4 block text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
              Internal note <span className="font-medium normal-case tracking-normal">(optional)</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Add context for the next rep or manager."
                className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-white outline-none placeholder:text-zinc-600 focus:border-rose-400/50"
              />
            </label>

            {message ? <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-200">{message}</p> : null}
            {error ? <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-bold text-red-200">{error}</p> : null}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-zinc-300 hover:text-white">Cancel</button>
              <button type="button" onClick={send} disabled={sending} className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50">
                {sending ? "Sending…" : `Send by ${channel === "sms" ? "Text" : "Email"}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
