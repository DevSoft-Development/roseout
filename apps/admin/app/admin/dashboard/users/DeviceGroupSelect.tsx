"use client";

import { useState } from "react";

export default function DeviceGroupSelect({
  email,
}: {
  email?: string | null;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    if (!email || !value) return;
    setSaving(true);
    setMessage("");

    const response = await fetch("/api/admin/users/device-group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, device_group: value }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(data.error || "Could not update Device Group.");
      setSaving(false);
      return;
    }

    setMessage(value === "executive" ? "Executive assigned" : "Standard assigned");
    setSaving(false);
  }

  if (!email) {
    return <span className="text-xs text-white/35">No email</span>;
  }

  return (
    <div className="grid gap-2">
      <select
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="min-h-9 rounded-lg border border-white/10 bg-[#0b0b0d] px-2 text-xs font-bold text-white"
      >
        <option value="">Device Group</option>
        <option value="standard">Standard</option>
        <option value="executive">Executive</option>
      </select>
      <button
        type="button"
        onClick={save}
        disabled={!value || saving}
        className="rounded-lg border border-white/10 px-2 py-1.5 text-xs font-black text-white disabled:opacity-40"
      >
        {saving ? "Saving..." : "Apply"}
      </button>
      {message ? <span className="text-[11px] text-white/45">{message}</span> : null}
    </div>
  );
}
