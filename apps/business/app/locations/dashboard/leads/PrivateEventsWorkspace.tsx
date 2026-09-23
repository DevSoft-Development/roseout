"use client";

import { useMemo, useState } from "react";

type Lead = Record<string, any>;

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.max(0, cents) / 100);
}
function parseDollars(value: string) {
  const number = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}
function stage(lead: Lead) {
  if (lead.status === "completed") return "Completed";
  if (lead.status === "lost" || lead.status === "canceled") return "Closed";
  if (lead.balance_status === "paid") return "Paid";
  if (lead.confirmed_at || lead.deposit_status === "paid") return "Confirmed";
  if (lead.contract_status === "signed") return "Signed";
  if (lead.contract_status === "sent") return "Contract";
  if (lead.proposal_sent_at) return "Proposal";
  return "Lead";
}

export function PrivateEventsWorkspace({ locationId, initialLeads }: { locationId: string; initialLeads: Lead[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const metrics = useMemo(() => ({
    open: leads.filter((l) => !["completed", "lost", "canceled"].includes(String(l.status))).length,
    proposals: leads.filter((l) => l.proposal_sent_at).length,
    signed: leads.filter((l) => l.contract_status === "signed").length,
    booked: leads.filter((l) => l.confirmed_at || l.deposit_status === "paid").length,
  }), [leads]);

  async function mutate(lead: Lead, action: string, extra: Record<string, unknown> = {}) {
    setBusy(lead.id);
    setMessage("");
    try {
      const response = await fetch("/api/business/leads", {
        method: action === "payment_link" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationId, leadId: lead.id, action, ...extra }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update lead.");
      if (data.checkoutUrl) {
        await navigator.clipboard?.writeText(data.checkoutUrl).catch(() => undefined);
        setMessage("Payment link created and copied.");
      } else if (data.lead) {
        setLeads((current) => current.map((item) => item.id === data.lead.id ? data.lead : item));
        setMessage(action === "send_contract" ? "Contract sent." : action === "send_proposal" ? "Proposal sent." : "Lead updated.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update lead.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Open leads", metrics.open],
          ["Proposals sent", metrics.proposals],
          ["Contracts signed", metrics.signed],
          ["Confirmed events", metrics.booked],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">{label}</p>
            <p className="mt-3 text-3xl font-black">{value}</p>
          </div>
        ))}
      </div>

      {message ? <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white/70">{message}</div> : null}

      <div className="space-y-4">
        {leads.map((lead) => <LeadCard key={lead.id} lead={lead} busy={busy === lead.id} onAction={mutate} />)}
        {!leads.length ? <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-sm text-white/55">No private-event or catering leads yet.</div> : null}
      </div>
    </div>
  );
}

function LeadCard({ lead, busy, onAction }: { lead: Lead; busy: boolean; onAction: (lead: Lead, action: string, extra?: Record<string, unknown>) => Promise<void> }) {
  const [title, setTitle] = useState(lead.proposal_title || `${lead.occasion || "Private event"} package`);
  const [description, setDescription] = useState(lead.proposal_description || "");
  const [total, setTotal] = useState((Number(lead.proposal_amount_cents || 0) / 100).toFixed(2));
  const [deposit, setDeposit] = useState((Number(lead.deposit_amount_cents || 0) / 100).toFixed(2));
  const [terms, setTerms] = useState(lead.contract_terms || "");
  const badge = stage(lead);
  const publicUrl = lead.public_token ? `https://theouthaven.com/private-events/${lead.public_token}` : "";

  return (
    <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-black">{lead.customer_name || "Event inquiry"}</h2>
            <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-black">{badge}</span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">{lead.lead_type === "catering" ? "Catering" : "Private event"}</span>
          </div>
          <p className="mt-2 text-sm text-white/55">{[lead.customer_email, lead.customer_phone].filter(Boolean).join(" · ")}</p>
          <p className="mt-1 text-sm text-white/55">{[lead.event_date, lead.event_time, lead.guest_count ? `${lead.guest_count} guests` : "", lead.occasion].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="text-left xl:text-right">
          <p className="text-xs uppercase tracking-[0.15em] text-white/40">Proposal</p>
          <p className="mt-1 text-2xl font-black">{money(Number(lead.proposal_amount_cents || 0))}</p>
          <p className="text-xs text-white/45">Deposit {money(Number(lead.deposit_amount_cents || 0))} · Balance {money(Number(lead.balance_amount_cents || 0))}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <label className="space-y-2 text-xs font-bold text-white/55">Proposal title<input value={title} onChange={(e)=>setTitle(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-2 text-xs font-bold text-white/55">Total<input value={total} onChange={(e)=>setTotal(e.target.value)} inputMode="decimal" className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none" /></label>
          <label className="space-y-2 text-xs font-bold text-white/55">Deposit<input value={deposit} onChange={(e)=>setDeposit(e.target.value)} inputMode="decimal" className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none" /></label>
        </div>
        <label className="space-y-2 text-xs font-bold text-white/55 lg:col-span-2">Proposal description<textarea value={description} onChange={(e)=>setDescription(e.target.value)} rows={3} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none" /></label>
        <label className="space-y-2 text-xs font-bold text-white/55 lg:col-span-2">Contract terms<textarea value={terms} onChange={(e)=>setTerms(e.target.value)} rows={5} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none" /></label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={busy} onClick={()=>onAction(lead,"save_proposal",{proposalTitle:title,proposalDescription:description,proposalAmountCents:parseDollars(total),depositAmountCents:parseDollars(deposit),contractTerms:terms,proposalPayload:lead.proposal_payload || {}})} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black">Save proposal</button>
        <button disabled={busy} onClick={()=>onAction(lead,"send_proposal")} className="rounded-full border border-rose-300/20 bg-rose-500/10 px-4 py-2 text-xs font-black text-rose-100">Send proposal</button>
        <button disabled={busy} onClick={()=>onAction(lead,"send_contract")} className="rounded-full border border-amber-300/20 bg-amber-400/10 px-4 py-2 text-xs font-black text-amber-100">Send contract</button>
        {lead.contract_status === "signed" && Number(lead.deposit_amount_cents || 0) > 0 && lead.deposit_status !== "paid" ? <button disabled={busy} onClick={()=>onAction(lead,"payment_link",{kind:"deposit"})} className="rounded-full bg-white px-4 py-2 text-xs font-black text-black">Deposit link</button> : null}
        {lead.confirmed_at && Number(lead.balance_amount_cents || 0) > 0 && lead.balance_status !== "paid" ? <button disabled={busy} onClick={()=>onAction(lead,"payment_link",{kind:"balance"})} className="rounded-full bg-white px-4 py-2 text-xs font-black text-black">Final payment link</button> : null}
        {lead.balance_status === "paid" || Number(lead.balance_amount_cents || 0) === 0 ? <button disabled={busy} onClick={()=>onAction(lead,"complete")} className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-4 py-2 text-xs font-black text-emerald-100">Complete event</button> : null}
        {!["completed","lost","canceled"].includes(String(lead.status)) ? <button disabled={busy} onClick={()=>onAction(lead,"lost")} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/60">Mark lost</button> : null}
        {publicUrl ? <a href={publicUrl} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/65">Customer view</a> : null}
      </div>
    </section>
  );
}
