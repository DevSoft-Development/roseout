"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminSecurityAccessButton({ userId, disabled }: { userId: string; disabled: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function toggle() {
    const next = !disabled;
    if (next && !window.confirm("Disable this admin's sign-in access?")) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/system/security/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disabled: next }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Security update failed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Security update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={`rounded-xl px-3 py-2 text-xs font-black ${disabled ? "bg-emerald-300 text-black" : "border border-rose-400/40 bg-rose-500/10 text-rose-200"}`}
      >
        {saving ? "Updating…" : disabled ? "Restore access" : "Disable access"}
      </button>
      {message ? <span className="max-w-56 text-right text-[11px] font-bold text-rose-200">{message}</span> : null}
    </div>
  );
}
