"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";
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

  useEffect(() => {
    setRole(currentRole);
  }, [currentRole]);

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
    <div className="flex min-w-[300px] flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`role-${userId}`}>Assigned role</label>
        <select
          id={`role-${userId}`}
          value={role}
          onChange={(event) => { setRole(event.target.value as AdminRole); setMessage(""); }}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-xs font-black text-white outline-none transition focus:border-white/25"
        >
          {roles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={saving || role === currentRole}
          className="inline-flex min-w-20 items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-xs font-black text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {saving ? "Saving" : "Apply"}
        </button>
      </div>
      {message ? <span className="text-[11px] font-bold text-white/45">{message}</span> : null}
    </div>
  );
}
