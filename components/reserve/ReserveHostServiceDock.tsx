"use client";

import Link from "next/link";
import { AlertTriangle, Plus, ShieldCheck, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getReservationGuestName } from "@/lib/reservations/ui";

const ACTIVE = new Set(["pending", "confirmed", "checked_in", "waiting", "arrived", "seated", "occupied"]);

function easternDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function easternTime() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function resourceLabel(resource: any) {
  return String(resource?.item_name || resource?.name || resource?.label || "Table").trim();
}

function resourceType(resource: any) {
  return String(resource?.item_type || resource?.type || "table").toLowerCase().replaceAll(" ", "_");
}

function resourceCapacity(resource: any) {
  const value = Number(resource?.capacity ?? resource?.capacity_max ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export default function ReserveHostServiceDock({
  locationId,
  refreshKey = 0,
}: {
  locationId: string;
  refreshKey?: number;
}) {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [managerPin, setManagerPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const date = useMemo(() => easternDate(), []);

  const load = useCallback(async () => {
    if (!locationId) return;
    try {
      const response = await fetch(
        `/api/v1/reserve/host/snapshot?locationId=${encodeURIComponent(locationId)}&date=${encodeURIComponent(date)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (response.ok) setSnapshot(data);
    } catch {
      // The main Host View owns degraded-mode messaging.
    }
  }, [date, locationId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const attention = snapshot?.attention || [];
  const pacing = snapshot?.pacing?.warnings || [];
  const canManageReservations = Boolean(snapshot?.access?.permissions?.manageReservations);
  const managers = (snapshot?.staff || []).filter(
    (person: any) => person.is_active !== false && String(person.role || "") === "manager",
  );
  const reservations = (snapshot?.reservations || []).filter((row: any) =>
    ACTIVE.has(String(row.status || "").toLowerCase()),
  );
  const tableResources = (snapshot?.resources || []).filter((resource: any) =>
    !["bar", "bar_seat", "counter", "counter_seat"].includes(resourceType(resource)),
  );

  async function createWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/reserve/host/walk-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          name: String(form.get("name") || "Walk-in guest").trim(),
          partySize: Number(form.get("partySize") || 1),
          phone: String(form.get("phone") || "").trim(),
          email: String(form.get("email") || "").trim(),
          date,
          time: easternTime(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to add this walk-in.");
      setWalkInOpen(false);
      setNotice("Walk-in added to Arriving.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to add this walk-in.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reservationId = String(form.get("reservationId") || "");
    const resourceId = String(form.get("resourceId") || "");
    const managerStaffProfileId = String(form.get("managerStaffProfileId") || "");
    const reason = String(form.get("reason") || "").trim();
    const resource = tableResources.find((row: any) => String(row.id || row.layout_item_id || "") === resourceId);
    if (!reservationId || !resource || !managerStaffProfileId || !reason || !/^\d{4,6}$/.test(managerPin)) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/reserve/host/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          reservationId,
          resource_id: resource.id || resource.layout_item_id,
          resource_label: resourceLabel(resource),
          seat_after_assign: true,
          override_reason: reason,
          managerStaffProfileId,
          managerPin,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to apply manager override.");
      setOverrideOpen(false);
      setManagerPin("");
      setNotice(`Approved by ${data.managerApproval?.displayName || "manager"} and audited.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to apply manager override.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="border-b border-white/10 bg-[#080a0d] px-3 py-2 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWalkInOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-[#e1062a] px-3.5 py-2 text-[11px] font-black text-white"
          >
            <Plus size={13} /> Add walk-in
          </button>
          <button
            type="button"
            onClick={() => setAttentionOpen((value) => !value)}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black ${
              attention.length || pacing.length
                ? "border-[#e1062a]/40 bg-[#e1062a]/10 text-[#ff9bad]"
                : "border-white/10 bg-white/[0.04] text-white/65"
            }`}
          >
            <AlertTriangle size={13} /> Attention {attention.length + pacing.length}
          </button>
          {canManageReservations ? (
            <button
              type="button"
              onClick={() => { setManagerPin(""); setOverrideOpen(true); }}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[11px] font-black text-white/70"
            >
              <ShieldCheck size={13} /> Request manager approval
            </button>
          ) : null}
          <Link
            href="/locations/dashboard/reservations/operations"
            className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[11px] font-black text-white/60"
          >
            Multi-location
          </Link>
          {notice ? <span className="text-[11px] font-bold text-white/55">{notice}</span> : null}
        </div>

        {attentionOpen ? (
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {attention.map((item: any) => (
              <div key={item.key} className="rounded-xl border border-[#e1062a]/25 bg-[#e1062a]/8 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#ff8aa0]">Host attention</p>
                <p className="mt-1 text-xs font-bold text-white/80">{item.message}</p>
              </div>
            ))}
            {pacing.map((item: any, index: number) => (
              <div key={`${item.startMinute}-${item.windowMinutes}-${index}`} className="rounded-xl border border-amber-300/25 bg-amber-300/8 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-amber-200">Pacing</p>
                <p className="mt-1 text-xs font-bold text-white/80">{item.covers} covers in {item.windowMinutes} minutes exceeds the {item.limit}-cover limit.</p>
              </div>
            ))}
            {!attention.length && !pacing.length ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs font-bold text-white/40">No service issues need attention.</div>
            ) : null}
          </div>
        ) : null}
      </div>

      {walkInOpen ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={() => setWalkInOpen(false)}>
          <form onSubmit={createWalkIn} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-[1.5rem] border border-white/10 bg-[#0a0c10] p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ff6b86]">Host action</p><h2 className="mt-1 text-xl font-black">Add walk-in</h2></div><button type="button" onClick={() => setWalkInOpen(false)}><X size={18} /></button></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-black text-white/55 sm:col-span-2">Guest name<input name="name" autoFocus className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white outline-none focus:border-[#e1062a]/60" placeholder="Guest name" /></label>
              <label className="text-xs font-black text-white/55">Party size<input name="partySize" type="number" min="1" max="100" defaultValue="2" required className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white" /></label>
              <label className="text-xs font-black text-white/55">Phone<input name="phone" inputMode="tel" className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white" /></label>
              <label className="text-xs font-black text-white/55 sm:col-span-2">Email<input name="email" type="email" className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white" /></label>
            </div>
            <button disabled={busy} className="mt-4 w-full rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black text-white disabled:opacity-40">{busy ? "Adding…" : "Add to Arriving"}</button>
          </form>
        </div>
      ) : null}

      {overrideOpen && canManageReservations ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={() => setOverrideOpen(false)}>
          <form onSubmit={submitOverride} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-[1.5rem] border border-white/10 bg-[#0a0c10] p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ff6b86]">Manager approval</p><h2 className="mt-1 text-xl font-black">Approve capacity exception</h2></div><button type="button" onClick={() => setOverrideOpen(false)}><X size={18} /></button></div>
            <p className="mt-2 text-xs font-semibold text-white/45">A host can request this exception, but a Reserve manager must approve it with their own PIN. Hard table conflicts remain blocked.</p>
            <div className="mt-4 grid gap-3">
              <label className="text-xs font-black text-white/55">Reservation<select name="reservationId" required className="mt-2 w-full rounded-xl border border-white/15 bg-[#111318] px-3 py-3 text-white"><option value="">Choose reservation</option>{reservations.map((row: any) => <option key={row.id} value={row.id}>{getReservationGuestName(row)} · party {row.party_size || 1}</option>)}</select></label>
              <label className="text-xs font-black text-white/55">Table<select name="resourceId" required className="mt-2 w-full rounded-xl border border-white/15 bg-[#111318] px-3 py-3 text-white"><option value="">Choose table</option>{tableResources.map((row: any) => <option key={row.id || row.layout_item_id || resourceLabel(row)} value={row.id || row.layout_item_id}>{resourceLabel(row)} · {resourceCapacity(row)} seats</option>)}</select></label>
              <label className="text-xs font-black text-white/55">Reason<textarea name="reason" required maxLength={500} className="mt-2 min-h-24 w-full rounded-xl border border-white/15 bg-black/30 p-3 text-white outline-none focus:border-[#e1062a]/60" placeholder="Why is this capacity exception appropriate?" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-black text-white/55">Approving manager<select name="managerStaffProfileId" required className="mt-2 w-full rounded-xl border border-white/15 bg-[#111318] px-3 py-3 text-white"><option value="">Choose manager</option>{managers.map((person: any) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select></label>
                <label className="text-xs font-black text-white/55">Manager PIN<input value={managerPin} onChange={(event) => setManagerPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="[0-9]*" minLength={4} maxLength={6} required className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-center text-lg font-black tracking-[0.3em] text-white outline-none focus:border-[#e1062a]/60" placeholder="••••" /></label>
              </div>
              {!managers.length ? <p className="rounded-xl border border-amber-300/25 bg-amber-300/8 p-3 text-xs font-bold text-amber-100">No active Reserve manager profile is configured. Add a manager and PIN in Service controls before approvals can be used.</p> : null}
            </div>
            <button disabled={busy || !managers.length || !/^\d{4,6}$/.test(managerPin)} className="mt-4 w-full rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black text-white disabled:opacity-40">{busy ? "Verifying manager…" : "Verify PIN & approve"}</button>
          </form>
        </div>
      ) : null}
    </>
  );
}