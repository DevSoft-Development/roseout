"use client";

import { useState } from "react";

type AccountProfileFormProps = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  compact?: boolean;
};

export default function AccountProfileForm({
  fullName,
  email,
  phone,
  compact = false,
}: AccountProfileFormProps) {
  const [nameValue, setNameValue] = useState(fullName || "");
  const [phoneValue, setPhoneValue] = useState(phone || "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSaving(true);

    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: nameValue,
          phone: phoneValue,
        }),
      });

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error || "Unable to update your account.");
        return;
      }

      setMessage("Account updated.");
    } catch {
      setError("Unable to update your account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={compact ? "space-y-3" : "mt-6 space-y-4"}>
      {email && (
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">
            Email
          </p>
          <p className="mt-1 break-all text-sm font-bold text-white/70">{email}</p>
        </div>
      )}

      <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-white/35">
          Name
        </span>
        <input
          value={nameValue}
          onChange={(event) => setNameValue(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-white/25 focus:border-rose-400"
          placeholder="Your name"
        />
      </label>

      <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-white/35">
          Phone
        </span>
        <input
          value={phoneValue}
          onChange={(event) => setPhoneValue(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-white/25 focus:border-rose-400"
          placeholder="Your phone number"
        />
      </label>

      {message && <p className="text-sm font-bold text-emerald-300">{message}</p>}
      {error && <p className="text-sm font-bold text-red-300">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Account"}
      </button>
    </form>
  );
}
