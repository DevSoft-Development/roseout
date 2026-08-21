"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MailingBatchCreateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    try {
      const response = await fetch("/api/admin/mailing-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not create mailing batch.");
      router.push(`/admin/dashboard/operations/mailing-batches/${data.batchId}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create mailing batch.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-rose-300";

  return (
    <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-black">Create mailing batch</h2>
        <p className="text-sm text-white/50">Build a batch from eligible, unclaimed locations with complete mailing addresses and permanent claim codes.</p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input className={inputClass} name="name" placeholder="Batch name (optional)" />
        <select className={inputClass} name="quantity" defaultValue="250">
          <option className="text-black" value="100">100 locations</option>
          <option className="text-black" value="250">250 locations</option>
          <option className="text-black" value="500">500 locations</option>
        </select>
        <input className={inputClass} name="plannedMailDate" type="date" aria-label="Planned mail date" />
        <input className={inputClass} name="q" placeholder="Search name, address, city or ZIP" />
        <input className={inputClass} name="city" placeholder="City (optional)" />
        <input className={inputClass} name="state" placeholder="State, e.g. NY" maxLength={2} />
        <input className={inputClass} name="zip" placeholder="ZIP prefix (optional)" />
        <input className={inputClass} name="notes" placeholder="Internal notes (optional)" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button disabled={busy} className="rounded-xl bg-white px-5 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? "Creating batch…" : "Create batch"}
        </button>
        <span className="text-xs text-white/40">Locations already active in another mailing batch are skipped automatically.</span>
      </div>

      {message ? <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm font-bold text-rose-100">{message}</p> : null}
    </form>
  );
}
