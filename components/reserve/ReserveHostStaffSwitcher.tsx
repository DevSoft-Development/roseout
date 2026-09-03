"use client";

import { useState } from "react";
import { LogOut, X } from "lucide-react";

export default function ReserveHostStaffSwitcher({
  locationId,
  staff,
  session,
  onChanged,
}: {
  locationId: string;
  staff: any[];
  session: any;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify() {
    if (!selected || !/^\d{4,6}$/.test(pin)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/reserve/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify_pin", locationId, staffProfileId: selected.id, pin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to sign in.");
      setOpen(false); setSelected(null); setPin(""); onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally { setBusy(false); }
  }

  async function logout() {
    await fetch("/api/v1/reserve/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout", locationId }),
    });
    onChanged();
  }

  return <>
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-2 text-xs font-black text-white">{session?.profile?.display_name || "Staff sign in"}</button>
      {session ? <button type="button" onClick={() => void logout()} title="Sign out staff" className="rounded-full border border-white/10 p-2 text-white/50 hover:text-white"><LogOut size={14} /></button> : null}
    </div>
    {open ? <div className="fixed inset-0 z-[110] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={() => setOpen(false)}><div className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-[#0a0c10] p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Quick switch</p><h2 className="mt-1 text-xl font-black">Who is using this device?</h2></div><button type="button" onClick={() => setOpen(false)}><X size={18} /></button></div><div className="mt-4 grid grid-cols-2 gap-2">{staff.filter((person) => person.can_quick_switch !== false).map((person) => <button key={person.id} type="button" onClick={() => { setSelected(person); setPin(""); setError(""); }} className={`rounded-xl border p-3 text-left ${selected?.id === person.id ? "border-[#e1062a]/60 bg-[#e1062a]/12" : "border-white/10 bg-white/[0.035]"}`}><p className="text-sm font-black">{person.display_name}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">{String(person.role || "staff").replaceAll("_", " ")}</p></button>)}</div>{selected ? <div className="mt-4"><label className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">4–6 digit PIN</label><input autoFocus inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(event) => event.key === "Enter" && void verify()} className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-center text-2xl font-black tracking-[0.35em] outline-none focus:border-[#e1062a]/70" />{error ? <p className="mt-2 text-xs font-bold text-[#ff8aa0]">{error}</p> : null}<button type="button" disabled={busy || !/^\d{4,6}$/.test(pin)} onClick={() => void verify()} className="mt-3 w-full rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black text-white disabled:opacity-40">{busy ? "Signing in…" : "Sign in"}</button></div> : null}</div></div> : null}
  </>;
}