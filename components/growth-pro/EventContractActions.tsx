"use client";

import { useState } from "react";

export function EventContractActions({
  token,
  signed,
  depositDue,
  customerEmail,
}: {
  token: string;
  signed: boolean;
  depositDue: boolean;
  customerEmail: string | null;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/event-contract/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Could not process this agreement.");
      if (json.checkoutUrl) {
        window.location.assign(json.checkoutUrl);
        return;
      }
      setMessage("Agreement saved.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not process this agreement.");
    } finally {
      setBusy(false);
    }
  }

  if (signed) {
    return (
      <div className="mt-6 rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-5">
        <p className="font-black text-emerald-100">Agreement signed</p>
        <p className="mt-2 text-sm text-emerald-50/70">
          {depositDue ? "Your deposit is still due to confirm the event." : "The venue has your signed agreement."}
        </p>
        {depositDue ? (
          <button
            disabled={busy}
            onClick={() => void post({ action: "pay_deposit" })}
            className="mt-4 rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-50"
          >
            {busy ? "Opening secure payment…" : "Pay deposit"}
          </button>
        ) : null}
        {message ? <p className="mt-3 text-sm text-white/70">{message}</p> : null}
      </div>
    );
  }

  return (
    <form
      className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void post({
          action: "sign",
          signerName: form.get("signerName"),
          signerEmail: form.get("signerEmail"),
          accepted: form.get("accepted") === "on",
        });
      }}
    >
      <div>
        <label className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Full legal name</label>
        <input name="signerName" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 p-3" />
      </div>
      <div>
        <label className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Email</label>
        <input name="signerEmail" type="email" required defaultValue={customerEmail || ""} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 p-3" />
      </div>
      <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
        <input name="accepted" type="checkbox" required className="mt-1" />
        <span>I have reviewed the event details and agree to the terms shown above. Typing my name and submitting constitutes my electronic signature.</span>
      </label>
      <button disabled={busy} className="rounded-full bg-rose-600 px-6 py-3 font-black text-white disabled:opacity-50">
        {busy ? "Signing…" : depositDue ? "Sign & continue to deposit" : "Sign agreement"}
      </button>
      {message ? <p className="text-sm text-rose-100">{message}</p> : null}
    </form>
  );
}
