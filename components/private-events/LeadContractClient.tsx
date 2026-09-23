"use client";

import { useMemo, useState } from "react";

type Lead = {
  id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  occasion?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  guest_count?: number | null;
  proposal_title?: string | null;
  proposal_description?: string | null;
  proposal_payload?: Record<string, any> | null;
  proposal_amount_cents?: number | null;
  proposal_currency?: string | null;
  contract_terms?: string | null;
  contract_status?: string | null;
  contract_signed_at?: string | null;
  deposit_amount_cents?: number | null;
  deposit_status?: string | null;
  balance_amount_cents?: number | null;
  balance_status?: string | null;
  status?: string | null;
  public_token: string;
};

function money(cents: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.max(0, Number(cents || 0)) / 100);
}

export function LeadContractClient({ lead }: { lead: Lead }) {
  const [name, setName] = useState(lead.customer_name || "");
  const [email, setEmail] = useState(lead.customer_email || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const signed = lead.contract_status === "signed";
  const lineItems = useMemo(() => Array.isArray(lead.proposal_payload?.items) ? lead.proposal_payload?.items : [], [lead.proposal_payload]);

  async function sign() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/location-leads/contract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: lead.public_token, signerName: name, signerEmail: email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not sign contract.");
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      setMessage("Contract signed. Your event is confirmed.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign contract.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#090b10] px-5 py-10 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-7 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">TheOutHaven Private Events</p>
          <h1 className="mt-3 text-3xl font-black">{lead.proposal_title || "Private event proposal"}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">{lead.proposal_description || "Review your event details, contract, and payment schedule."}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-black/30 p-4"><p className="text-xs text-white/45">Event</p><p className="mt-1 font-bold">{lead.occasion || "Private event"}</p></div>
            <div className="rounded-2xl bg-black/30 p-4"><p className="text-xs text-white/45">Date</p><p className="mt-1 font-bold">{lead.event_date || "To be confirmed"}</p></div>
            <div className="rounded-2xl bg-black/30 p-4"><p className="text-xs text-white/45">Time</p><p className="mt-1 font-bold">{lead.event_time || "To be confirmed"}</p></div>
            <div className="rounded-2xl bg-black/30 p-4"><p className="text-xs text-white/45">Guests</p><p className="mt-1 font-bold">{lead.guest_count || "—"}</p></div>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Proposal total</p><p className="mt-2 text-4xl font-black">{money(lead.proposal_amount_cents)}</p></div>
            <div className="text-right text-sm text-white/60"><p>Deposit: <strong className="text-white">{money(lead.deposit_amount_cents)}</strong></p><p>Final balance: <strong className="text-white">{money(lead.balance_amount_cents)}</strong></p></div>
          </div>
          {lineItems.length ? <div className="mt-6 space-y-2">{lineItems.map((item:any, index:number)=><div key={index} className="flex justify-between gap-4 rounded-2xl bg-black/25 px-4 py-3"><span>{String(item.name || item.label || "Package item")}</span><strong>{money(Number(item.amount_cents || item.amountCents || 0))}</strong></div>)}</div> : null}
        </section>

        <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-7">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Contract terms</p>
          <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/75">{lead.contract_terms || "Contract terms will appear here when the location sends the agreement."}</div>
        </section>

        <section className="rounded-[32px] border border-rose-200/15 bg-rose-500/[0.06] p-7">
          {signed ? (
            <div><p className="text-lg font-black text-emerald-200">Contract signed</p><p className="mt-2 text-sm text-white/65">Your signature is recorded. Payment status: deposit {lead.deposit_status || "not required"}, balance {lead.balance_status || "not required"}.</p></div>
          ) : (
            <>
              <h2 className="text-xl font-black">Electronic signature</h2>
              <p className="mt-2 text-sm text-white/60">Typing your name and selecting “Sign contract” records your acceptance of the terms above.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Full legal name" className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3 outline-none" />
                <input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="Email address" type="email" className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3 outline-none" />
              </div>
              <button onClick={sign} disabled={busy || !name || !email} className="mt-4 rounded-full bg-rose-600 px-6 py-3 text-sm font-black disabled:opacity-50">{busy ? "Signing…" : Number(lead.deposit_amount_cents || 0) > 0 ? "Sign contract & pay deposit" : "Sign contract"}</button>
              {message ? <p className="mt-3 text-sm text-white/70">{message}</p> : null}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
