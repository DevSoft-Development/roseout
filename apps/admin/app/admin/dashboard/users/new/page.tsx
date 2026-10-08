"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type ApiResponse = {
  error?: string;
  success?: boolean;
  invite_sent?: boolean;
  reused_user?: boolean;
  device_group?: string;
  device_group_assigned?: boolean;
  device_group_error?: string | null;
};

const ROLE_OPTIONS = [
  ["user", "User"],
  ["owner", "Owner"],
  ["viewer", "Viewer"],
  ["editor", "Editor"],
  ["reviewer", "Reviewer"],
  ["admin", "Admin"],
  ["manager", "Manager"],
  ["superadmin", "Superadmin"],
  ["ambassador", "Ambassador"],
  ["experience", "Experience"],
  ["partner_ambassador", "Partner Ambassador"],
  ["experience_team", "Experience Team"],
] as const;

export default function NewAdminUserPage() {
  const [loading, setLoading] = useState(false);
  const [sendInvite, setSendInvite] = useState(true);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "idle"; message: string }>({
    tone: "idle",
    message: "",
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus({ tone: "idle", message: "" });

    const form = new FormData(event.currentTarget);
    const payload = {
      first_name: String(form.get("first_name") || "").trim(),
      last_name: String(form.get("last_name") || "").trim(),
      email: String(form.get("email") || "").trim().toLowerCase(),
      phone: String(form.get("phone") || "").trim() || null,
      role: String(form.get("role") || "user"),
      device_group: String(form.get("device_group") || "standard"),
      send_invite: sendInvite,
    };

    const response = await fetch("/api/admin/users/create-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as ApiResponse;

    if (!response.ok) {
      setStatus({ tone: "error", message: data.error || "User could not be created." });
      setLoading(false);
      return;
    }

    const groupLabel = data.device_group === "executive" ? "Executive" : "Standard";
    const groupMessage = data.device_group_assigned
      ? ` Device Group: ${groupLabel}.`
      : data.device_group_error
        ? ` User created, but Device Group assignment needs attention: ${data.device_group_error}`
        : "";

    setStatus({
      tone: data.device_group_error ? "error" : "success",
      message: `${data.reused_user ? "Existing user updated." : data.invite_sent ? "User created and invitation sent." : "User created."}${groupMessage}`,
    });

    setLoading(false);
    if (!data.device_group_error) {
      event.currentTarget.reset();
      setSendInvite(true);
    }
  }

  const inputClass =
    "min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 py-2 text-sm font-bold text-white outline-none focus:border-rose-300/50";

  return (
    <main className="min-h-screen px-4 pb-10 pt-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="admin-panel rounded-3xl p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-white/40">User Management</p>
              <h1 className="mt-2 text-3xl font-black">Add User</h1>
              <p className="mt-2 text-sm text-white/55">
                Create a TheOutHaven user and assign the managed-device access group used by Intune.
              </p>
            </div>
            <Link
              href="/admin/dashboard/users"
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-black"
            >
              Back to Users
            </Link>
          </div>
        </section>

        <section className="admin-panel rounded-3xl p-5 sm:p-6">
          <form onSubmit={submit} className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-xs font-black uppercase tracking-[.14em] text-white/45">
                First name
                <input name="first_name" required className={inputClass} />
              </label>
              <label className="grid gap-2 text-xs font-black uppercase tracking-[.14em] text-white/45">
                Last name
                <input name="last_name" required className={inputClass} />
              </label>
            </div>

            <label className="grid gap-2 text-xs font-black uppercase tracking-[.14em] text-white/45">
              Email
              <input name="email" required type="email" className={inputClass} />
            </label>

            <label className="grid gap-2 text-xs font-black uppercase tracking-[.14em] text-white/45">
              Mobile number
              <input name="phone" inputMode="tel" className={inputClass} />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-xs font-black uppercase tracking-[.14em] text-white/45">
                Role
                <select name="role" defaultValue="user" className={inputClass}>
                  {ROLE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-xs font-black uppercase tracking-[.14em] text-white/45">
                Device Group
                <select name="device_group" defaultValue="standard" className={inputClass}>
                  <option value="standard">Standard</option>
                  <option value="executive">Executive</option>
                </select>
                <span className="text-[11px] font-medium normal-case tracking-normal text-white/35">
                  Controls managed app availability and device policies. It does not change the user role.
                </span>
              </label>
            </div>

            <label className="flex items-center gap-3 text-sm font-bold text-white/70">
              <input
                type="checkbox"
                checked={sendInvite}
                onChange={(event) => setSendInvite(event.target.checked)}
              />
              Send account invitation now
            </label>

            {status.tone !== "idle" ? (
              <div
                className={
                  status.tone === "success"
                    ? "rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-100"
                    : "rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm font-bold text-rose-100"
                }
              >
                {status.message}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 border-t border-white/10 pt-5">
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create User"}
              </button>
              <Link
                href="/admin/dashboard/users"
                className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-black"
              >
                Cancel
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
