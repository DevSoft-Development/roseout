"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, ShieldCheck, UsersRound } from "lucide-react";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export default function ReserveServiceControlPanel({ locationId }: { locationId: string }) {
  const [service, setService] = useState<any>({ settings: {}, sections: [], shifts: [] });
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [newSection, setNewSection] = useState("");
  const [newStaff, setNewStaff] = useState({ displayName: "", role: "server", pin: "" });
  const date = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), []);

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setNotice("");
    try {
      const [serviceResponse, staffResponse] = await Promise.all([
        fetch(`/api/v1/reserve/service?locationId=${encodeURIComponent(locationId)}&date=${encodeURIComponent(date)}`, { cache: "no-store" }),
        fetch(`/api/v1/reserve/staff?locationId=${encodeURIComponent(locationId)}`, { cache: "no-store" }),
      ]);
      const [serviceData, staffData] = await Promise.all([serviceResponse.json(), staffResponse.json()]);
      if (!serviceResponse.ok) throw new Error(serviceData.error || "Unable to load service controls.");
      setService({ settings: serviceData.settings || {}, sections: serviceData.sections || [], shifts: serviceData.shifts || [] });
      setStaff(staffData.staff || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load service controls.");
    } finally {
      setLoading(false);
    }
  }, [date, locationId]);

  useEffect(() => { void load(); }, [load]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("settings"); setNotice("");
    try {
      const response = await fetch("/api/v1/reserve/service", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          assignmentMode: form.get("assignmentMode"),
          includeBarInAutoAssignment: form.get("includeBar") === "on",
          maxCovers15m: Number(form.get("maxCovers15m") || 0) || null,
          maxCovers30m: Number(form.get("maxCovers30m") || 0) || null,
          walkinReserveCovers: Number(form.get("walkinReserveCovers") || 0),
          lateGraceMinutes: Number(form.get("lateGraceMinutes") || 15),
          floorFocusDefault: form.get("floorFocusDefault") === "on",
          offlineSnapshotMinutes: Number(form.get("offlineSnapshotMinutes") || 120),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save service controls.");
      setService((current: any) => ({ ...current, settings: data.settings }));
      setNotice("Service controls saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save service controls."); }
    finally { setBusy(""); }
  }

  async function createSection() {
    if (!newSection.trim()) return;
    setBusy("section"); setNotice("");
    try {
      const response = await fetch("/api/v1/reserve/service", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upsert_section", locationId, name: newSection.trim(), sortOrder: service.sections.length }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to add section.");
      setNewSection(""); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to add section."); }
    finally { setBusy(""); }
  }

  async function createStaff() {
    if (!newStaff.displayName.trim() || !/^\d{4,6}$/.test(newStaff.pin)) return;
    setBusy("staff"); setNotice("");
    try {
      const response = await fetch("/api/v1/reserve/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_profile", locationId, displayName: newStaff.displayName.trim(), role: newStaff.role, pin: newStaff.pin }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create staff profile.");
      setNewStaff({ displayName: "", role: "server", pin: "" }); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to create staff profile."); }
    finally { setBusy(""); }
  }

  async function saveShift(person: any, patch: Record<string, any>) {
    const existing = service.shifts.find((shift: any) => shift.staff_profile_id === person.id);
    setBusy(`shift:${person.id}`); setNotice("");
    try {
      const response = await fetch("/api/v1/reserve/service", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upsert_shift", locationId, shiftId: existing?.id, staffProfileId: person.id, serviceDate: date, status: patch.status ?? existing?.status ?? "active", sectionId: patch.sectionId ?? existing?.section_id ?? null, maxTables: patch.maxTables ?? existing?.max_tables ?? null, maxCovers: patch.maxCovers ?? existing?.max_covers ?? null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update shift.");
      setService((current: any) => ({ ...current, shifts: [...current.shifts.filter((shift: any) => shift.staff_profile_id !== person.id), data.shift] }));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to update shift."); }
    finally { setBusy(""); }
  }

  async function resetPin(person: any) {
    const pin = window.prompt(`Enter a new 4–6 digit PIN for ${person.display_name}.`);
    if (!pin) return;
    setBusy(`pin:${person.id}`); setNotice("");
    try {
      const response = await fetch("/api/v1/reserve/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_pin", locationId, staffProfileId: person.id, pin }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to reset PIN.");
      setNotice(`PIN updated for ${person.display_name}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to reset PIN."); }
    finally { setBusy(""); }
  }

  const settings = service.settings || {};
  return (
    <main className="min-h-screen bg-[#050607] p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">TheOutHaven Reserve</p><h1 className="mt-1 text-3xl font-black">Service controls</h1><p className="mt-2 max-w-2xl text-sm font-semibold text-white/45">Configure server balancing, sections, pacing, quick-switch PINs, and today’s active service team.</p></div>
          <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-white/65"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
        </div>
        {notice ? <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-3 text-sm font-bold">{notice}</p> : null}

        <form onSubmit={saveSettings} className="mt-6 rounded-[1.5rem] border border-white/10 bg-[#0a0c10] p-5">
          <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-[#ff6b86]" /><h2 className="text-lg font-black">Seating & pacing</h2></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-black text-white/55">Assignment mode<select name="assignmentMode" defaultValue={settings.assignment_mode || "balanced"} className="mt-2 w-full rounded-xl border border-white/15 bg-[#111318] px-3 py-3 text-sm text-white"><option value="manual">Manual</option><option value="rotation">Rotation</option><option value="balanced">Weighted balance</option></select></label>
            <label className="text-xs font-black text-white/55">Max covers / 15 min<input name="maxCovers15m" type="number" min="0" defaultValue={settings.max_covers_15m ?? ""} className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white" /></label>
            <label className="text-xs font-black text-white/55">Max covers / 30 min<input name="maxCovers30m" type="number" min="0" defaultValue={settings.max_covers_30m ?? ""} className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white" /></label>
            <label className="text-xs font-black text-white/55">Late grace minutes<input name="lateGraceMinutes" type="number" min="0" defaultValue={settings.late_grace_minutes ?? 15} className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white" /></label>
            <label className="text-xs font-black text-white/55">Walk-in reserve covers<input name="walkinReserveCovers" type="number" min="0" defaultValue={settings.walkin_reserve_covers ?? 0} className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white" /></label>
            <label className="text-xs font-black text-white/55">Offline snapshot minutes<input name="offlineSnapshotMinutes" type="number" min="30" defaultValue={settings.offline_snapshot_minutes ?? 120} className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white" /></label>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs font-black"><input name="includeBar" type="checkbox" defaultChecked={settings.include_bar_in_auto_assignment !== false} /> Include bar in auto assignment</label>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs font-black"><input name="floorFocusDefault" type="checkbox" defaultChecked={Boolean(settings.floor_focus_default)} /> Open host tablets in Floor Focus</label>
          </div>
          <button disabled={busy === "settings"} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#e1062a] px-4 py-3 text-xs font-black"><Save size={14} /> Save service controls</button>
        </form>

        <section className="mt-5 rounded-[1.5rem] border border-white/10 bg-[#0a0c10] p-5">
          <h2 className="text-lg font-black">Service sections</h2>
          <div className="mt-3 flex flex-wrap gap-2">{service.sections.map((section: any) => <span key={section.id} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black">{section.name}</span>)}</div>
          <div className="mt-3 flex max-w-md gap-2"><input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="Main Dining, Patio, Bar…" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm" /><button type="button" onClick={() => void createSection()} disabled={busy === "section" || !newSection.trim()} className="rounded-xl bg-[#e1062a] px-4 text-xs font-black disabled:opacity-40"><Plus size={14} /></button></div>
        </section>

        <section className="mt-5 rounded-[1.5rem] border border-white/10 bg-[#0a0c10] p-5">
          <div className="flex items-center gap-2"><UsersRound size={18} className="text-[#ff6b86]" /><h2 className="text-lg font-black">Today’s service team</h2></div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {staff.map((person) => {
              const shift = service.shifts.find((row: any) => row.staff_profile_id === person.id);
              return <div key={person.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-black">{person.display_name}</p><p className="text-[10px] font-black uppercase tracking-[0.08em] text-white/35">{String(person.role).replaceAll("_", " ")}</p></div><button type="button" onClick={() => void resetPin(person)} className="rounded-full border border-white/10 px-3 py-2 text-[10px] font-black">Reset PIN</button></div><div className="mt-3 grid grid-cols-2 gap-2"><select value={shift?.status || "unavailable"} onChange={(e) => void saveShift(person, { status: e.target.value })} className="rounded-xl border border-white/10 bg-[#111318] px-3 py-2 text-xs"><option value="active">Active</option><option value="scheduled">Scheduled</option><option value="break">Break</option><option value="cut">Cut</option><option value="clocked_out">Clocked out</option><option value="unavailable">Unavailable</option></select><select value={shift?.section_id || ""} onChange={(e) => void saveShift(person, { sectionId: e.target.value || null })} className="rounded-xl border border-white/10 bg-[#111318] px-3 py-2 text-xs"><option value="">No fixed section</option>{service.sections.map((section: any) => <option key={section.id} value={section.id}>{section.name}</option>)}</select><input type="number" min="0" placeholder="Max tables" defaultValue={shift?.max_tables ?? ""} onBlur={(e) => void saveShift(person, { maxTables: e.target.value ? Number(e.target.value) : null })} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs" /><input type="number" min="0" placeholder="Max covers" defaultValue={shift?.max_covers ?? ""} onBlur={(e) => void saveShift(person, { maxCovers: e.target.value ? Number(e.target.value) : null })} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs" /></div>{busy === `shift:${person.id}` || busy === `pin:${person.id}` ? <p className="mt-2 text-[10px] font-bold text-white/40">Updating…</p> : null}</div>;
            })}
          </div>
          <div className="mt-5 rounded-xl border border-dashed border-white/12 p-4"><p className="text-xs font-black uppercase tracking-[0.1em] text-white/40">Add service staff</p><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_160px_150px_auto]"><input value={newStaff.displayName} onChange={(e) => setNewStaff((current) => ({ ...current, displayName: e.target.value }))} placeholder="Display name" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm" /><select value={newStaff.role} onChange={(e) => setNewStaff((current) => ({ ...current, role: e.target.value }))} className="rounded-xl border border-white/10 bg-[#111318] px-3 py-2.5 text-sm"><option value="server">Server</option><option value="bartender">Bartender</option><option value="host">Host</option><option value="lead_host">Lead host</option><option value="manager">Manager</option></select><input value={newStaff.pin} onChange={(e) => setNewStaff((current) => ({ ...current, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))} inputMode="numeric" placeholder="4–6 digit PIN" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm" /><button type="button" onClick={() => void createStaff()} disabled={busy === "staff" || !newStaff.displayName.trim() || !/^\d{4,6}$/.test(newStaff.pin)} className="rounded-xl bg-[#e1062a] px-4 py-2.5 text-xs font-black disabled:opacity-40">Add</button></div></div>
        </section>
      </div>
    </main>
  );
}