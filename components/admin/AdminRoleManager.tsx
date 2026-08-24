"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminRole } from "@/lib/users/roles";

export default function AdminRoleManager({
  userId,
  currentRole,
  roles,
}: {
  userId: string;
  currentRole: AdminRole;
  roles: { value: AdminRole; label: string }[];
}) {
  const router = useRouter();
  const [role, setRole] = useState<AdminRole>(currentRole);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/system/roles/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Role update failed.");
      setMessage("Saved");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Role update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-w-[240px] flex-col gap-2 sm:flex-row sm:items-center">
      <select
        value={role}
        onChange={(event) => setRole(event.target.value as AdminRole)}
        className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm font-bold text-white"
      >
        {roles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button
        type="button"
        onClick={save}
        disabled={saving || role === currentRole}
        className="rounded-xl bg-white px-3 py-2 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      {message ? <span className="text-xs font-bold text-white/60">{message}</span> : null}
    </div>
  );
}
