"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminSecurityAccessButton({
  userId,
  disabled,
}: {
  userId: string;
  disabled: boolean;
}) {
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
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Security update failed.");
      }
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Security update failed.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="security-access-control">
      <button type="button" onClick={toggle} disabled={saving}>
        {saving ? "Updating…" : disabled ? "Restore access" : "Disable access"}
      </button>
      {message ? <span>{message}</span> : null}
    </div>
  );
}
