"use client";

import { useEffect, useState } from "react";

type RouteRow = {
  id?: string;
  category: string;
  department: string;
  admin_email?: string | null;
  is_active?: boolean;
};

export default function SupportDepartmentRoutingClient() {
  const [routing, setRouting] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRouting() {
      try {
        const res = await fetch("/api/admin/support/departments", { cache: "no-store" });
        const data = await res.json();
        setRouting(data.routing || []);
        if (data.warning) setMessage(`Using defaults until migration is applied: ${data.warning}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load routing.");
      } finally {
        setLoading(false);
      }
    }
    loadRouting();
  }, []);

  const update = (index: number, key: keyof RouteRow, value: string | boolean) => {
    setRouting((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/support/departments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routing }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save routing.");
      setRouting(data.routing || routing);
      setMessage("Support department routing saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save routing.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-sm font-bold text-white/50">Loading routing...</div>;

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
      {message && <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200">{message}</div>}
      {error && <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">{error}</div>}
      <div className="space-y-3">
        {routing.map((row, index) => (
          <div key={row.id || index} className="grid gap-3 rounded-3xl border border-white/10 bg-white/[0.06] p-4 lg:grid-cols-[1fr_1fr_1fr_120px]">
            <Field label="Ticket category" value={row.category} onChange={(value) => update(index, "category", value)} />
            <Field label="Department" value={row.department} onChange={(value) => update(index, "department", value)} />
            <Field label="Default admin email" value={row.admin_email || ""} onChange={(value) => update(index, "admin_email", value)} />
            <label className="flex items-end gap-2 pb-3 text-sm font-bold text-white/70">
              <input type="checkbox" checked={row.is_active !== false} onChange={(event) => update(index, "is_active", event.target.checked)} /> Active
            </label>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => setRouting((prev) => [...prev, { category: "", department: "", admin_email: "", is_active: true }])} className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10">Add category</button>
        <button type="button" onClick={save} disabled={saving} className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white shadow-lg disabled:opacity-60">{saving ? "Saving..." : "Save routing"}</button>
      </div>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500" />
    </label>
  );
}
