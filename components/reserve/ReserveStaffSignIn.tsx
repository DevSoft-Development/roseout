"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, TabletSmartphone } from "lucide-react";

type Staff = {
  id: string;
  display_name: string;
  role: string;
  can_quick_switch?: boolean;
};

export default function ReserveStaffSignIn({ locationId }: { locationId: string }) {
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<any>(null);
  const [canManage, setCanManage] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [session, setSession] = useState<any>(null);
  const [selected, setSelected] = useState<Staff | null>(null);
  const [pin, setPin] = useState("");
  const [label, setLabel] = useState("Front Desk iPad");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const deviceResponse = await fetch(
        `/api/v1/reserve/devices?locationId=${encodeURIComponent(locationId)}`,
        { cache: "no-store" },
      );
      const deviceData = await deviceResponse.json().catch(() => ({}));
      if (!deviceResponse.ok) {
        setDevice(null);
        setCanManage(false);
        setStaff([]);
        setSession(null);
        setError(deviceData.error || "This device is not authorized for Reserve.");
        return;
      }
      setDevice(deviceData.currentDevice || null);
      setCanManage(Boolean(deviceData.canManage));

      if (deviceData.currentDevice) {
        const staffResponse = await fetch(
          `/api/v1/reserve/staff?locationId=${encodeURIComponent(locationId)}`,
          { cache: "no-store" },
        );
        const staffData = await staffResponse.json().catch(() => ({}));
        if (!staffResponse.ok) throw new Error(staffData.error || "Unable to load staff.");
        setStaff((staffData.staff || []).filter((person: Staff) => person.can_quick_switch !== false));
        setSession(staffData.session || null);
        if (staffData.session?.profile) {
          window.location.replace(`/reserve/dashboard?locationId=${encodeURIComponent(locationId)}`);
          return;
        }
      } else {
        setStaff([]);
        setSession(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Reserve staff sign in.");
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function authorizeDevice() {
    setBusy("device");
    setError("");
    try {
      const response = await fetch("/api/v1/reserve/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, label }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to authorize this device.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to authorize this device.");
    } finally {
      setBusy("");
    }
  }

  async function signIn() {
    if (!selected || !/^\d{4,6}$/.test(pin)) return;
    setBusy("pin");
    setError("");
    try {
      const response = await fetch("/api/v1/reserve/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_pin",
          locationId,
          staffProfileId: selected.id,
          pin,
          deviceLabel: device?.label || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to sign in.");
      window.location.replace(`/reserve/dashboard?locationId=${encodeURIComponent(locationId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <div className="rounded-[1.75rem] border border-white/10 bg-[#0a0c10] p-6 text-sm font-bold text-white/50">Loading staff sign in…</div>;
  }

  if (!device) {
    return (
      <div className="rounded-[1.75rem] border border-white/10 bg-[#0a0c10] p-6 shadow-2xl">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-[#ff6b86]">
          <TabletSmartphone size={22} />
        </div>
        <h2 className="mt-4 text-2xl font-black">Authorize this Reserve device</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-white/50">
          An owner or manager with Team Access permission must authorize this device once. After that, staff use only their own PIN.
        </p>
        {canManage ? (
          <>
            <label className="mt-5 block text-xs font-black uppercase tracking-[0.12em] text-white/45">
              Device name
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-sm font-bold text-white outline-none focus:border-[#e1062a]/60"
              />
            </label>
            <button
              type="button"
              onClick={() => void authorizeDevice()}
              disabled={busy === "device" || !label.trim()}
              className="mt-4 w-full rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black text-white disabled:opacity-40"
            >
              {busy === "device" ? "Authorizing…" : "Authorize this device"}
            </button>
          </>
        ) : (
          <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm font-bold text-amber-100">
            Ask a location owner or manager to open Reserve from the Business dashboard and authorize this device.
          </div>
        )}
        {error ? <p className="mt-4 text-sm font-bold text-[#ff8aa0]">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-[#0a0c10] p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Staff sign in</p>
          <h2 className="mt-1 text-2xl font-black">Who is using this device?</h2>
          <p className="mt-2 text-sm font-semibold text-white/45">{device.label}</p>
        </div>
        <ShieldCheck className="text-emerald-400" size={28} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {staff.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => {
              setSelected(person);
              setPin("");
              setError("");
            }}
            className={`rounded-xl border p-4 text-left transition ${selected?.id === person.id ? "border-[#e1062a]/60 bg-[#e1062a]/12" : "border-white/10 bg-white/[0.035] hover:bg-white/[0.06]"}`}
          >
            <p className="text-sm font-black">{person.display_name}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">
              {String(person.role || "staff").replaceAll("_", " ")}
            </p>
          </button>
        ))}
      </div>

      {!staff.length ? (
        <div className="mt-5 rounded-xl border border-dashed border-white/12 p-4 text-sm font-semibold text-white/45">
          No active Reserve staff profiles are available. Add staff from Reservation Settings → Team Access.
        </div>
      ) : null}

      {selected ? (
        <div className="mt-5">
          <label className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">
            {selected.display_name}&apos;s 4–6 digit PIN
          </label>
          <input
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(event) => event.key === "Enter" && void signIn()}
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-center text-2xl font-black tracking-[0.35em] outline-none focus:border-[#e1062a]/70"
          />
          <button
            type="button"
            onClick={() => void signIn()}
            disabled={busy === "pin" || !/^\d{4,6}$/.test(pin)}
            className="mt-3 w-full rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black text-white disabled:opacity-40"
          >
            {busy === "pin" ? "Signing in…" : "Open Host View"}
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm font-bold text-[#ff8aa0]">{error}</p> : null}
    </div>
  );
}
