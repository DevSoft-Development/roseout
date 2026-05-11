"use client";

import { useState } from "react";

type AccountProfileFormProps = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  bio?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  compact?: boolean;
};

export default function AccountProfileForm({
  fullName,
  email,
  phone,
  username,
  bio,
  address,
  city,
  state,
  zipCode,
  compact = false,
}: AccountProfileFormProps) {
  const [nameValue, setNameValue] = useState(fullName || "");
  const [phoneValue, setPhoneValue] = useState(phone || "");
  const [usernameValue, setUsernameValue] = useState(username || "");
  const [bioValue, setBioValue] = useState(bio || "");
  const [addressValue, setAddressValue] = useState(address || "");
  const [cityValue, setCityValue] = useState(city || "");
  const [stateValue, setStateValue] = useState(state || "");
  const [zipCodeValue, setZipCodeValue] = useState(zipCode || "");
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
          username: usernameValue,
          bio: bioValue,
          address: addressValue,
          city: cityValue,
          state: stateValue,
          zip_code: zipCodeValue,
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
          <p className="mt-1 text-xs font-semibold text-white/35">Email cannot be changed here.</p>
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

      <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-white/35">
          Username
        </span>
        <input
          value={usernameValue}
          onChange={(event) => setUsernameValue(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-white/25 focus:border-rose-400"
          placeholder="Your display username"
        />
      </label>

      <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-white/35">
          Bio
        </span>
        <textarea
          value={bioValue}
          onChange={(event) => setBioValue(event.target.value)}
          className="mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-white/25 focus:border-rose-400"
          placeholder="Tell us about yourself"
        />
      </label>

      <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-white/35">
          Address
        </span>
        <input
          value={addressValue}
          onChange={(event) => setAddressValue(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-white/25 focus:border-rose-400"
          placeholder="Street address"
        />
      </label>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-white/35">
            City
          </span>
          <input
            value={cityValue}
            onChange={(event) => setCityValue(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-white/25 focus:border-rose-400"
            placeholder="City"
          />
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-white/35">
            State
          </span>
          <input
            value={stateValue}
            onChange={(event) => setStateValue(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-white/25 focus:border-rose-400"
            placeholder="State"
          />
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-white/35">
            Zip
          </span>
          <input
            value={zipCodeValue}
            onChange={(event) => setZipCodeValue(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-white/25 focus:border-rose-400"
            placeholder="Zip code"
          />
        </label>
      </div>

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
