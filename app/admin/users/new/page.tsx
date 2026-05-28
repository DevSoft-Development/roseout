"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { normalizeRole, USER_ROLE_OPTIONS } from "@/lib/users/roles";

type ApiResponse = {
  error?: string;
  success?: boolean;
  user?: { id: string; email?: string | null };
  invite_sent?: boolean;
};

export default function AddUserPage() {
  const [loading, setLoading] = useState(false);
  const [sendInvite, setSendInvite] = useState(true);
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message: string }>({ type: "idle", message: "" });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ type: "idle", message: "" });

    const form = new FormData(e.currentTarget);
    const payload = {
      email: String(form.get("email") || "").trim().toLowerCase(),
      first_name: String(form.get("first_name") || "").trim(),
      last_name: String(form.get("last_name") || "").trim(),
      phone: String(form.get("phone") || "").trim() || null,
      role: normalizeRole(String(form.get("role") || "user")),
      assigned_location_id: String(form.get("assigned_location_id") || "").trim() || null,
      status: String(form.get("status") || "invited"),
      send_invite: sendInvite,
    };

    const res = await fetch("/api/admin/users/create-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as ApiResponse;

    if (!res.ok) {
      setStatus({ type: "error", message: data.error || "Failed to create user." });
      setLoading(false);
      return;
    }

    setStatus({
      type: "success",
      message: data.invite_sent
        ? "User created and password setup email sent."
        : "User created in invited status. Send invite when ready.",
    });
    setLoading(false);
    e.currentTarget.reset();
    setSendInvite(true);
  };

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1000px]">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_35%),linear-gradient(135deg,#160b0b,#090706_55%,#140f0a)] p-5 shadow-2xl sm:p-6">
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.3em] text-rose-300">TheOutHaven Admin</p>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Add User</h1>
              <p className="mt-3 text-sm text-white/70">The user will receive a secure email to create their own password.</p>
            </div>
            <Link href="/admin/dashboard/users" className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">Back</Link>
          </div>
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
          <form onSubmit={handleSubmit} className="grid gap-5 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <input name="first_name" required placeholder="First name" className="h-12 rounded-2xl border border-black/10 px-4 font-bold" />
              <input name="last_name" required placeholder="Last name" className="h-12 rounded-2xl border border-black/10 px-4 font-bold" />
            </div>
            <input name="email" required type="email" placeholder="user@email.com" className="h-12 rounded-2xl border border-black/10 px-4 font-bold" />
            <input name="phone" placeholder="Phone (optional)" className="h-12 rounded-2xl border border-black/10 px-4 font-bold" />
            <select name="role" className="h-12 rounded-2xl border border-black/10 px-4 font-bold">
              {USER_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input name="assigned_location_id" placeholder="Assigned location ID (owner only)" className="h-12 rounded-2xl border border-black/10 px-4 font-bold" />
            <select name="status" className="h-12 rounded-2xl border border-black/10 px-4 font-bold"><option value="invited">Invited</option><option value="active">Active</option></select>
            <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={sendInvite} onChange={(e)=>setSendInvite(e.target.checked)} />Send password setup email now</label>
            {status.type !== "idle" && <p className={`rounded-xl p-3 text-sm font-semibold ${status.type === "success" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{status.message}</p>}
            <div className="flex gap-3 pt-4">
              <button type="submit" disabled={loading} className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white disabled:opacity-50">{loading ? "Creating..." : "Create User"}</button>
              <Link href="/admin/dashboard/users" className="rounded-full border border-black/10 px-6 py-3 text-sm font-black">Cancel</Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
