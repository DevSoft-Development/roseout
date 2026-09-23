"use client";

import { useMemo, useState } from "react";

function dollars(cents: unknown) {
  const value = Number(cents || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

function centsFromInput(value: FormDataEntryValue | null) {
  const n = Number(String(value || "0"));
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0;
}

export function EventLeadWorkspaceClient({
  locationId,
  initialLeads,
}: {
  locationId: string;
  initialLeads: any[];
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [selectedId, setSelectedId] = useState(initialLeads[0]?.id || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const selected = useMemo(() => leads.find((lead) => lead.id === selectedId) || leads[0] || null, [leads, selectedId]);

  async function mutate(leadId: string, body: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setMessage("");
    try {
      const response = await fetch(`/api/business/leads/${encodeURIComponent(leadId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Could not update lead.");
      if (json.lead) setLeads((rows) => rows.map((row) => row.id === leadId ? json.lead : row));
      if (json.signUrl) setMessage(`Agreement sent. Secure link: ${json.signUrl}`);
      else if (json.checkoutUrl) setMessage("Payment link was created and emailed to the customer.");
      else setMessage("Saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update lead.");
    } finally {
      setBusy("");
    }
  }

  if (!selected) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--business-border)] bg-[var(--business-panel)] p-8 text-center text-[var(--business-muted)]">
        No private-event or catering leads yet.
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <aside className="space-y-3">
        {leads.map((lead) => (
          <button
            key={lead.id}
            onClick={() => setSelectedId(lead.id)}
            className={`w-full rounded-3xl border p-4 text-left transition ${lead.id === selected.id ? "border-rose-300/40 bg-rose-500/10" : "border-[var(--business-border)] bg-[var(--business-panel)]"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-black">{lead.customer_name || "Event lead"}</p>
              <span className="rounded-full border border-[var(--business-border)] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]">
                {String(lead.lead_type || "private_event").replace(/_/g, " ")}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--business-muted)]">
              {[lead.event_date, lead.guest_count ? `${lead.guest_count} guests` : null].filter(Boolean).join(" • ") || "Date and guest count pending"}
            </p>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="font-bold capitalize">{String(lead.commercial_stage || lead.status || "lead").replace(/_/g, " ")}</span>
              <span className="text-[var(--business-soft)]">{dollars(lead.quote_total_cents)}</span>
            </div>
          </button>
        ))}
      </aside>

      <section className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">Commercial workspace</p>
            <h2 className="mt-2 text-2xl font-black">{selected.customer_name || "Event lead"}</h2>
            <p className="mt-1 text-sm text-[var(--business-muted)]">{selected.customer_email || "No email"}{selected.customer_phone ? ` • ${selected.customer_phone}` : ""}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[
              ["Stage", selected.commercial_stage || selected.status],
              ["Proposal", selected.proposal_status],
              ["Contract", selected.contract_status],
              ["Revenue", dollars(Number(selected.deposit_paid_cents || 0) + Number(selected.balance_paid_cents || 0))],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--business-muted)]">{label}</p>
                <p className="mt-1 font-black capitalize">{String(value || "—").replace(/_/g, " ")}</p>
              </div>
            ))}
          </div>
        </div>

        <form
          key={selected.id}
          className="mt-6 grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const subtotal = centsFromInput(form.get("quote_subtotal"));
            const tax = centsFromInput(form.get("quote_tax"));
            void mutate(selected.id, {
              action: "save_proposal",
              locationId,
              lead_type: form.get("lead_type"),
              occasion: form.get("occasion"),
              event_date: form.get("event_date"),
              event_time: form.get("event_time"),
              guest_count: form.get("guest_count"),
              budget_range: form.get("budget_range"),
              food_needs: form.get("food_needs"),
              drink_needs: form.get("drink_needs"),
              private_room_needed: form.get("private_room_needed") === "on",
              package_interest: form.get("package_interest"),
              notes: form.get("notes"),
              quote_subtotal_cents: subtotal,
              quote_tax_cents: tax,
              quote_total_cents: subtotal + tax,
              deposit_required_cents: centsFromInput(form.get("deposit_required")),
              currency: "usd",
              proposal_payload: { summary: String(form.get("proposal_summary") || "") },
              contract_payload: { terms: String(form.get("contract_terms") || "") },
            }, "save");
          }}
        >
          <label className="space-y-2 text-sm font-bold">Lead type
            <select name="lead_type" defaultValue={selected.lead_type || "private_event"} className="w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3">
              <option value="private_event">Private event</option>
              <option value="catering">Catering</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-bold">Occasion
            <input name="occasion" defaultValue={selected.occasion || ""} className="w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3" />
          </label>
          <label className="space-y-2 text-sm font-bold">Event date
            <input name="event_date" type="date" defaultValue={selected.event_date || ""} className="w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3" />
          </label>
          <label className="space-y-2 text-sm font-bold">Event time
            <input name="event_time" defaultValue={selected.event_time || ""} className="w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3" />
          </label>
          <label className="space-y-2 text-sm font-bold">Guest count
            <input name="guest_count" type="number" min="1" defaultValue={selected.guest_count || ""} className="w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3" />
          </label>
          <label className="space-y-2 text-sm font-bold">Budget
            <input name="budget_range" defaultValue={selected.budget_range || ""} placeholder="$3,000–$5,000" className="w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3" />
          </label>
          <label className="space-y-2 text-sm font-bold">Package
            <input name="package_interest" defaultValue={selected.package_interest || ""} placeholder="Birthday package, full buyout…" className="w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3" />
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3 text-sm font-bold">
            <input name="private_room_needed" type="checkbox" defaultChecked={Boolean(selected.private_room_needed)} />
            Private room requested
          </label>
          <label className="space-y-2 text-sm font-bold">Food needs
            <textarea name="food_needs" defaultValue={selected.food_needs || ""} className="min-h-24 w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3" />
          </label>
          <label className="space-y-2 text-sm font-bold">Drink needs
            <textarea name="drink_needs" defaultValue={selected.drink_needs || ""} className="min-h-24 w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3" />
          </label>
          <label className="space-y-2 text-sm font-bold md:col-span-2">Proposal summary
            <textarea name="proposal_summary" defaultValue={selected.proposal_payload?.summary || ""} className="min-h-28 w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3" />
          </label>
          <div className="grid gap-4 md:col-span-2 md:grid-cols-3">
            <label className="space-y-2 text-sm font-bold">Subtotal
              <input name="quote_subtotal" type="number" min="0" step="0.01" defaultValue={(Number(selected.quote_subtotal_cents || 0) / 100).toFixed(2)} className="w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3" />
            </label>
            <label className="space-y-2 text-sm font-bold">Tax / service charges
              <input name="quote_tax" type="number" min="0" step="0.01" defaultValue={(Number(selected.quote_tax_cents || 0) / 100).toFixed(2)} className="w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3" />
            </label>
            <label className="space-y-2 text-sm font-bold">Deposit required
              <input name="deposit_required" type="number" min="0" step="0.01" defaultValue={(Number(selected.deposit_required_cents || 0) / 100).toFixed(2)} className="w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3" />
            </label>
          </div>
          <label className="space-y-2 text-sm font-bold md:col-span-2">Agreement terms
            <textarea name="contract_terms" defaultValue={selected.contract_payload?.terms || ""} placeholder="Cancellation policy, timing, minimums, venue rules…" className="min-h-36 w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3" />
          </label>
          <label className="space-y-2 text-sm font-bold md:col-span-2">Internal notes
            <textarea name="notes" defaultValue={selected.notes || ""} className="min-h-24 w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3" />
          </label>

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button disabled={busy === "save"} className="rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-50">Save proposal</button>
            <button type="button" onClick={() => void mutate(selected.id, { action: "send_proposal" }, "proposal")} className="rounded-full border border-[var(--business-border)] px-5 py-3 text-sm font-black">Send proposal</button>
            <button type="button" onClick={() => void mutate(selected.id, { action: "send_contract" }, "contract")} className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white">Send contract</button>
            {selected.contract_status === "signed" && Number(selected.balance_due_cents || 0) > Number(selected.balance_paid_cents || 0) ? (
              <button type="button" onClick={() => void mutate(selected.id, { action: "send_balance_link" }, "balance")} className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-5 py-3 text-sm font-black text-emerald-100">Send balance link</button>
            ) : null}
            {selected.contract_status === "signed" ? (
              <button type="button" onClick={() => void mutate(selected.id, { action: "complete" }, "complete")} className="rounded-full border border-[var(--business-border)] px-5 py-3 text-sm font-black">Mark completed</button>
            ) : null}
            <button type="button" onClick={() => void mutate(selected.id, { action: "lost" }, "lost")} className="rounded-full border border-red-300/25 px-5 py-3 text-sm font-black text-red-200">Mark lost</button>
          </div>
          {message ? <p className="md:col-span-2 rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-3 text-sm font-bold">{message}</p> : null}
        </form>
      </section>
    </div>
  );
}
