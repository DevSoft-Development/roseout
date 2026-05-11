"use client";

import { useState } from "react";

export default function SupportTicketAssignmentForm({ ticketId, initialDepartment, initialAssignedEmail, departments, adminEmails }: { ticketId: string; initialDepartment?: string | null; initialAssignedEmail?: string | null; departments: string[]; adminEmails: string[] }) {
  const [department, setDepartment] = useState(initialDepartment || departments[0] || "Guest Care");
  const [assignedEmail, setAssignedEmail] = useState(initialAssignedEmail || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department, assigned_admin_email: assignedEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to reassign ticket.");
      setMessage("Ticket assignment updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reassign ticket.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-6 rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">Assignment</p>
      <h2 className="mt-2 text-2xl font-black">Reassign support ticket</h2>
      {message && <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-200">{message}</div>}
      {error && <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-200">{error}</div>}
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Department</span>
          <select value={department} onChange={(event) => setDepartment(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500">
            {departments.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Admin user</span>
          <select value={assignedEmail} onChange={(event) => setAssignedEmail(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500">
            <option value="">Unassigned</option>
            {adminEmails.map((email) => <option key={email} value={email}>{email}</option>)}
          </select>
        </label>
        <button type="button" onClick={save} disabled={saving} className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg disabled:opacity-60">{saving ? "Saving..." : "Save assignment"}</button>
      </div>
    </section>
  );
}
